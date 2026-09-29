#include "Weapons/TFPSWeaponComponent.h"

#include "AbilitySystemComponent.h"
#include "Character/TFPSCharacter.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/AssetManager.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StreamableManager.h"
#include "Net/Core/PushModel/PushModel.h"
#include "Net/UnrealNetwork.h"
#include "TacticalFPS.h"
#include "Weapons/TFPSWeaponDefinition.h"

UTFPSWeaponComponent::UTFPSWeaponComponent(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	PrimaryComponentTick.bCanEverTick = false;
	SetIsReplicatedByDefault(true);
}

void UTFPSWeaponComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	FDoRepLifetimeParams Everyone;
	Everyone.bIsPushBased = true;
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, EquippedWeapon, Everyone);

	FDoRepLifetimeParams OwnerOnly;
	OwnerOnly.bIsPushBased = true;
	OwnerOnly.Condition = COND_OwnerOnly;
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, AmmoInMag, OwnerOnly);
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, ReserveAmmo, OwnerOnly);
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, ServerAckedShotSeq, OwnerOnly);
}

void UTFPSWeaponComponent::InitializeWeapons(UAbilitySystemComponent* ASC)
{
	check(GetOwner()->HasAuthority());

	AbilitySystemComponent = ASC;

	if (DefaultWeapon)
	{
		EquipWeapon(DefaultWeapon);
	}
}

void UTFPSWeaponComponent::UninitializeWeapons()
{
	if (!GetOwner()->HasAuthority())
	{
		return;
	}

	WeaponGrantedHandles.TakeFromAbilitySystem(AbilitySystemComponent.Get());
	AbilitySystemComponent.Reset();
}

void UTFPSWeaponComponent::EquipWeapon(const UTFPSWeaponDefinition* NewWeapon)
{
	check(GetOwner()->HasAuthority());

	UAbilitySystemComponent* ASC = AbilitySystemComponent.Get();
	if (!ASC)
	{
		UE_LOG(LogTFPS, Warning, TEXT("EquipWeapon called on [%s] before InitializeWeapons."), *GetNameSafe(GetOwner()));
		return;
	}

	WeaponGrantedHandles.TakeFromAbilitySystem(ASC);

	EquippedWeapon = NewWeapon;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, EquippedWeapon, this);

	AmmoInMag = NewWeapon ? NewWeapon->MagazineSize : 0;
	ReserveAmmo = NewWeapon ? NewWeapon->MaxReserveAmmo : 0;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, AmmoInMag, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, ReserveAmmo, this);

	FireRateCredits = MaxFireRateCredits;
	LastCreditRefillTime = GetWorld()->GetTimeSeconds();

	if (NewWeapon && NewWeapon->AbilitySet)
	{
		// SourceObject = the definition, so abilities can find the weapon that granted them.
		NewWeapon->AbilitySet->GiveToAbilitySystem(ASC, &WeaponGrantedHandles, const_cast<UTFPSWeaponDefinition*>(NewWeapon));
	}

	// Server doesn't get OnRep; listen-server hosts still need visuals.
	OnRep_EquippedWeapon();
}

bool UTFPSWeaponComponent::ServerConsumeFireRateCredit()
{
	check(GetOwner()->HasAuthority());

	if (!EquippedWeapon)
	{
		return false;
	}

	const double Now = GetWorld()->GetTimeSeconds();
	const float Interval = EquippedWeapon->GetFireInterval();

	FireRateCredits = FMath::Min(MaxFireRateCredits, FireRateCredits + static_cast<float>((Now - LastCreditRefillTime) / Interval));
	LastCreditRefillTime = Now;

	if (FireRateCredits < 1.f)
	{
		UE_LOG(LogTFPS, Verbose, TEXT("[%s] shot rejected: over fire rate (credits %.2f)."), *GetNameSafe(GetOwner()), FireRateCredits);
		return false;
	}

	FireRateCredits -= 1.f;
	return true;
}

bool UTFPSWeaponComponent::ServerConsumeAmmo(uint16 ShotSeq)
{
	check(GetOwner()->HasAuthority());

	// Always ack, even on failure, so the client's prediction converges on the server's count.
	ServerAckedShotSeq = ShotSeq;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, ServerAckedShotSeq, this);

	if (AmmoInMag <= 0)
	{
		return false;
	}

	--AmmoInMag;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, AmmoInMag, this);
	return true;
}

void UTFPSWeaponComponent::ServerRejectShot(uint16 ShotSeq)
{
	check(GetOwner()->HasAuthority());

	ServerAckedShotSeq = ShotSeq;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, ServerAckedShotSeq, this);
}

void UTFPSWeaponComponent::ServerReload()
{
	check(GetOwner()->HasAuthority());

	if (!EquippedWeapon)
	{
		return;
	}

	const int32 Needed = EquippedWeapon->MagazineSize - AmmoInMag;
	const int32 Moved = FMath::Clamp(Needed, 0, ReserveAmmo);
	if (Moved == 0)
	{
		return;
	}

	AmmoInMag += Moved;
	ReserveAmmo -= Moved;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, AmmoInMag, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, ReserveAmmo, this);
}

uint16 UTFPSWeaponComponent::PredictShot()
{
	// Wraps at 65535; the subtraction in GetAmmoInMagazine is modular so wrap-around is harmless.
	return ++LocalShotSeq;
}

int32 UTFPSWeaponComponent::GetAmmoInMagazine() const
{
	if (GetOwner()->HasAuthority() || !IsOwnerLocallyControlled())
	{
		return AmmoInMag;
	}

	const uint16 PendingShots = static_cast<uint16>(LocalShotSeq - ServerAckedShotSeq);
	return FMath::Max(AmmoInMag - static_cast<int32>(PendingShots), 0);
}

bool UTFPSWeaponComponent::IsOwnerLocallyControlled() const
{
	const APawn* Pawn = Cast<APawn>(GetOwner());
	return Pawn && Pawn->IsLocallyControlled();
}

void UTFPSWeaponComponent::OnRep_EquippedWeapon()
{
	// A new weapon means a new magazine; re-base prediction on the next server ack.
	LocalShotSeq = ServerAckedShotSeq;

	RefreshCosmetics();
	OnWeaponEquipped.Broadcast(EquippedWeapon);
}

void UTFPSWeaponComponent::RefreshCosmetics()
{
	// Dedicated servers never load or attach weapon meshes: hit registration uses the camera ray and
	// character hitboxes, not the weapon model.
	if (GetNetMode() == NM_DedicatedServer)
	{
		return;
	}

	DestroyCosmetics();

	if (CosmeticsLoadHandle.IsValid())
	{
		CosmeticsLoadHandle->CancelHandle();
		CosmeticsLoadHandle.Reset();
	}

	if (!EquippedWeapon)
	{
		return;
	}

	TArray<FSoftObjectPath> ToLoad;
	if (IsOwnerLocallyControlled() && !EquippedWeapon->FirstPersonMesh.IsNull())
	{
		ToLoad.Add(EquippedWeapon->FirstPersonMesh.ToSoftObjectPath());
	}
	if (!EquippedWeapon->ThirdPersonMesh.IsNull())
	{
		ToLoad.Add(EquippedWeapon->ThirdPersonMesh.ToSoftObjectPath());
	}

	if (ToLoad.IsEmpty())
	{
		return;
	}

	const UTFPSWeaponDefinition* LoadingFor = EquippedWeapon;
	CosmeticsLoadHandle = UAssetManager::GetStreamableManager().RequestAsyncLoad(
		ToLoad,
		FStreamableDelegate::CreateWeakLambda(this, [this, LoadingFor]() { OnCosmeticsLoaded(LoadingFor); }));
}

void UTFPSWeaponComponent::OnCosmeticsLoaded(const UTFPSWeaponDefinition* LoadedFor)
{
	// The weapon may have changed while loading.
	if (LoadedFor != EquippedWeapon)
	{
		return;
	}

	const ATFPSCharacter* Character = Cast<ATFPSCharacter>(GetOwner());
	if (!Character)
	{
		return;
	}

	auto SpawnMesh = [this](USkeletalMesh* Mesh, USceneComponent* Parent, FName Socket) -> USkeletalMeshComponent*
	{
		if (!Mesh || !Parent)
		{
			return nullptr;
		}

		USkeletalMeshComponent* Comp = NewObject<USkeletalMeshComponent>(GetOwner());
		Comp->SetSkeletalMesh(Mesh);
		Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Comp->SetupAttachment(Parent, Socket);
		Comp->RegisterComponent();
		return Comp;
	};

	if (IsOwnerLocallyControlled())
	{
		FirstPersonWeaponMesh = SpawnMesh(LoadedFor->FirstPersonMesh.Get(), Character->GetMesh1P(), LoadedFor->FirstPersonAttachSocket);
		if (FirstPersonWeaponMesh)
		{
			FirstPersonWeaponMesh->SetOnlyOwnerSee(true);
			FirstPersonWeaponMesh->CastShadow = false;
		}
	}

	ThirdPersonWeaponMesh = SpawnMesh(LoadedFor->ThirdPersonMesh.Get(), Character->GetMesh(), LoadedFor->ThirdPersonAttachSocket);
	if (ThirdPersonWeaponMesh)
	{
		ThirdPersonWeaponMesh->SetOwnerNoSee(true);
		ThirdPersonWeaponMesh->bCastHiddenShadow = true;
	}
}

void UTFPSWeaponComponent::DestroyCosmetics()
{
	if (FirstPersonWeaponMesh)
	{
		FirstPersonWeaponMesh->DestroyComponent();
		FirstPersonWeaponMesh = nullptr;
	}
	if (ThirdPersonWeaponMesh)
	{
		ThirdPersonWeaponMesh->DestroyComponent();
		ThirdPersonWeaponMesh = nullptr;
	}
}
