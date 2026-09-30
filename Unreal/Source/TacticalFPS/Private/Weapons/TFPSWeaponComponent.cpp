#include "Weapons/TFPSWeaponComponent.h"

#include "AbilitySystemComponent.h"
#include "Character/TFPSCharacter.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/AssetManager.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/StreamableManager.h"
#include "Loadout/TFPSAttachmentDefinition.h"
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
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, Slots, Everyone);
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, ActiveSlot, Everyone);

	FDoRepLifetimeParams OwnerOnly;
	OwnerOnly.bIsPushBased = true;
	OwnerOnly.Condition = COND_OwnerOnly;
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, SlotStats, OwnerOnly);
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, SlotAmmoInMag, OwnerOnly);
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, SlotReserveAmmo, OwnerOnly);
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, ServerAckedShotSeq, OwnerOnly);
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSWeaponComponent, ServerReloadCount, OwnerOnly);
}

// --- Server -------------------------------------------------------------------------------------

void UTFPSWeaponComponent::InitializeWeapons(UAbilitySystemComponent* ASC, const TArray<FTFPSWeaponSlot>& Loadout, const FTFPSWeaponStatModifiers& GlobalModifiers)
{
	check(GetOwner()->HasAuthority());
	check(ASC);

	WeaponGrantedHandles.TakeFromAbilitySystem(ASC);
	AbilitySystemComponent = ASC;

	Slots.Reset();
	SlotStats.Reset();
	SlotAmmoInMag.Reset();
	SlotReserveAmmo.Reset();

	for (const FTFPSWeaponSlot& Entry : Loadout)
	{
		if (!Entry.Weapon)
		{
			continue; // Empty slot (e.g. no secondary).
		}

		FTFPSWeaponStatModifiers Modifiers = GlobalModifiers;
		for (const UTFPSAttachmentDefinition* Attachment : Entry.Attachments)
		{
			if (Attachment)
			{
				Modifiers.Combine(Attachment->Modifiers);
			}
		}

		const FTFPSWeaponStats Stats = Entry.Weapon->BuildStats(Modifiers);
		Slots.Add(Entry);
		SlotStats.Add(Stats);
		SlotAmmoInMag.Add(Stats.MagazineSize);
		SlotReserveAmmo.Add(Stats.MaxReserveAmmo);

		if (Entry.Weapon->AbilitySet)
		{
			// SourceObject = the definition; UTFPSWeaponGameplayAbility gates on it matching the active weapon.
			Entry.Weapon->AbilitySet->GiveToAbilitySystem(ASC, &WeaponGrantedHandles, const_cast<UTFPSWeaponDefinition*>(Entry.Weapon.Get()));
		}
	}

	ActiveSlot = 0;
	WeaponReadyTime = 0.0;
	FireRateCredits = MaxFireRateCredits;
	LastCreditRefillTime = GetWorld()->GetTimeSeconds();

	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, Slots, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, ActiveSlot, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, SlotStats, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, SlotAmmoInMag, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, SlotReserveAmmo, this);

	// Server doesn't get OnRep; listen-server hosts still need visuals.
	OnRep_Slots();
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

void UTFPSWeaponComponent::ServerSetActiveSlot(int32 NewSlot)
{
	check(GetOwner()->HasAuthority());

	if (!Slots.IsValidIndex(NewSlot) || NewSlot == ActiveSlot)
	{
		return;
	}

	ActiveSlot = static_cast<uint8>(NewSlot);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, ActiveSlot, this);

	WeaponReadyTime = GetWorld()->GetTimeSeconds() + SlotStats[NewSlot].EquipTime * EquipTimeTolerance;

	OnRep_ActiveSlot();
}

bool UTFPSWeaponComponent::ServerConsumeFireRateCredit()
{
	check(GetOwner()->HasAuthority());

	const FTFPSWeaponStats* Stats = GetEquippedStats();
	if (!Stats)
	{
		return false;
	}

	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < WeaponReadyTime)
	{
		UE_LOG(LogTFPS, Verbose, TEXT("[%s] shot rejected: weapon still being equipped."), *GetNameSafe(GetOwner()));
		return false;
	}

	FireRateCredits = FMath::Min(MaxFireRateCredits, FireRateCredits + static_cast<float>((Now - LastCreditRefillTime) / Stats->FireInterval));
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
	ServerRejectShot(ShotSeq);

	if (!SlotAmmoInMag.IsValidIndex(ActiveSlot) || SlotAmmoInMag[ActiveSlot] <= 0)
	{
		return false;
	}

	--SlotAmmoInMag[ActiveSlot];
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, SlotAmmoInMag, this);
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

	if (!SlotStats.IsValidIndex(ActiveSlot))
	{
		return;
	}

	// Always bump, even if nothing moved, so the owner's reload prediction is resolved either way.
	++ServerReloadCount;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, ServerReloadCount, this);

	const int32 Needed = SlotStats[ActiveSlot].MagazineSize - SlotAmmoInMag[ActiveSlot];
	const int32 Moved = FMath::Clamp(Needed, 0, SlotReserveAmmo[ActiveSlot]);
	if (Moved == 0)
	{
		return;
	}

	SlotAmmoInMag[ActiveSlot] += Moved;
	SlotReserveAmmo[ActiveSlot] -= Moved;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, SlotAmmoInMag, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSWeaponComponent, SlotReserveAmmo, this);
}

bool UTFPSWeaponComponent::CanReload() const
{
	const FTFPSWeaponStats* Stats = GetEquippedStats();
	return Stats && GetAmmoInMagazine() < Stats->MagazineSize && GetReserveAmmo() > 0;
}

// --- Owning client ------------------------------------------------------------------------------

void UTFPSWeaponComponent::PredictReload()
{
	const FTFPSWeaponStats* Stats = GetEquippedStats();
	if (!Stats)
	{
		return;
	}

	const int32 CurrentMag = GetAmmoInMagazine();
	const int32 CurrentReserve = GetReserveAmmo();
	const int32 Moved = FMath::Clamp(Stats->MagazineSize - CurrentMag, 0, CurrentReserve);

	PredictedReload.Slot = GetActiveSlot();
	PredictedReload.ShotSeqAtReload = LocalShotSeq;
	PredictedReload.AmmoInMag = CurrentMag + Moved;
	PredictedReload.ReserveAmmo = CurrentReserve - Moved;
	PredictedReload.ExpectedReloadCount = static_cast<uint8>(ServerReloadCount + 1);
}

void UTFPSWeaponComponent::ClearPredictedReload()
{
	PredictedReload.Slot = INDEX_NONE;
}

void UTFPSWeaponComponent::OnRep_ServerReloadCount()
{
	if (PredictedReload.Slot != INDEX_NONE && static_cast<int8>(ServerReloadCount - PredictedReload.ExpectedReloadCount) >= 0)
	{
		ClearPredictedReload(); // Server's ammo now includes the reload.
	}
}

uint16 UTFPSWeaponComponent::PredictShot()
{
	// Drop shots the server has already acked. Sequence numbers wrap at 65535; the signed 16-bit
	// difference keeps comparisons correct across the wrap.
	PendingShots.RemoveAll([this](const FPendingShot& Shot) { return static_cast<int16>(Shot.Seq - ServerAckedShotSeq) <= 0; });

	FPendingShot& Shot = PendingShots.AddDefaulted_GetRef();
	Shot.Seq = ++LocalShotSeq;
	Shot.Slot = static_cast<uint8>(GetActiveSlot());
	return Shot.Seq;
}

void UTFPSWeaponComponent::PredictActiveSlot(int32 NewSlot)
{
	if (!Slots.IsValidIndex(NewSlot))
	{
		return;
	}

	PredictedActiveSlot = NewSlot;
	RefreshCosmetics();
	OnWeaponEquipped.Broadcast(GetEquippedWeapon());
}

void UTFPSWeaponComponent::ClearPredictedActiveSlot()
{
	if (PredictedActiveSlot == INDEX_NONE)
	{
		return;
	}

	PredictedActiveSlot = INDEX_NONE;
	RefreshCosmetics();
	OnWeaponEquipped.Broadcast(GetEquippedWeapon());
}

// --- Queries ------------------------------------------------------------------------------------

const UTFPSWeaponDefinition* UTFPSWeaponComponent::GetEquippedWeapon() const
{
	const int32 Slot = GetActiveSlot();
	return Slots.IsValidIndex(Slot) ? Slots[Slot].Weapon.Get() : nullptr;
}

const FTFPSWeaponStats* UTFPSWeaponComponent::GetEquippedStats() const
{
	const int32 Slot = GetActiveSlot();
	return SlotStats.IsValidIndex(Slot) ? &SlotStats[Slot] : nullptr;
}

int32 UTFPSWeaponComponent::GetAmmoInMagazine() const
{
	const int32 Slot = GetActiveSlot();
	if (!SlotAmmoInMag.IsValidIndex(Slot))
	{
		return 0;
	}

	if (GetOwner()->HasAuthority() || !IsOwnerLocallyControlled())
	{
		return SlotAmmoInMag[Slot];
	}

	if (PredictedReload.Slot == Slot)
	{
		// Only shots fired after the predicted reload come out of the predicted magazine.
		int32 ShotsSinceReload = 0;
		for (const FPendingShot& Shot : PendingShots)
		{
			if (Shot.Slot == Slot && static_cast<int16>(Shot.Seq - PredictedReload.ShotSeqAtReload) > 0)
			{
				++ShotsSinceReload;
			}
		}
		return FMath::Max(PredictedReload.AmmoInMag - ShotsSinceReload, 0);
	}

	int32 Pending = 0;
	for (const FPendingShot& Shot : PendingShots)
	{
		if (Shot.Slot == Slot && static_cast<int16>(Shot.Seq - ServerAckedShotSeq) > 0)
		{
			++Pending;
		}
	}
	return FMath::Max(SlotAmmoInMag[Slot] - Pending, 0);
}

int32 UTFPSWeaponComponent::GetReserveAmmo() const
{
	const int32 Slot = GetActiveSlot();
	if (PredictedReload.Slot == Slot && Slot != INDEX_NONE)
	{
		return PredictedReload.ReserveAmmo;
	}

	return SlotReserveAmmo.IsValidIndex(Slot) ? SlotReserveAmmo[Slot] : 0;
}

bool UTFPSWeaponComponent::IsOwnerLocallyControlled() const
{
	const APawn* Pawn = Cast<APawn>(GetOwner());
	return Pawn && Pawn->IsLocallyControlled();
}

// --- Replication --------------------------------------------------------------------------------

void UTFPSWeaponComponent::OnRep_Slots()
{
	// New loadout: old predictions refer to weapons that no longer exist.
	PendingShots.Reset();
	ClearPredictedReload();
	LocalShotSeq = ServerAckedShotSeq;
	PredictedActiveSlot = INDEX_NONE;

	RefreshCosmetics(true);
	OnWeaponEquipped.Broadcast(GetEquippedWeapon());
}

void UTFPSWeaponComponent::OnRep_ActiveSlot()
{
	if (PredictedActiveSlot == ActiveSlot)
	{
		PredictedActiveSlot = INDEX_NONE; // Server confirmed the predicted swap.
	}

	RefreshCosmetics();
	OnWeaponEquipped.Broadcast(GetEquippedWeapon());
}

// --- Cosmetics ----------------------------------------------------------------------------------

void UTFPSWeaponComponent::RefreshCosmetics(bool bForce)
{
	// Dedicated servers never load or attach weapon meshes: hit registration uses the camera ray and
	// character hitboxes, not the weapon model.
	if (GetNetMode() == NM_DedicatedServer)
	{
		return;
	}

	const UTFPSWeaponDefinition* Weapon = GetEquippedWeapon();
	const int32 Slot = GetActiveSlot();
	if (!bForce && CosmeticWeapon.Get() == Weapon && CosmeticSlot == Slot)
	{
		return;
	}

	DestroyCosmetics();
	CosmeticWeapon = Weapon;
	CosmeticSlot = Slot;

	if (CosmeticsLoadHandle.IsValid())
	{
		CosmeticsLoadHandle->CancelHandle();
		CosmeticsLoadHandle.Reset();
	}

	if (!Weapon)
	{
		return;
	}

	TArray<FSoftObjectPath> ToLoad;
	if (IsOwnerLocallyControlled() && !Weapon->FirstPersonMesh.IsNull())
	{
		ToLoad.Add(Weapon->FirstPersonMesh.ToSoftObjectPath());
	}
	if (!Weapon->ThirdPersonMesh.IsNull())
	{
		ToLoad.Add(Weapon->ThirdPersonMesh.ToSoftObjectPath());
	}
	for (const UTFPSAttachmentDefinition* Attachment : Slots[Slot].Attachments)
	{
		if (Attachment && !Attachment->Mesh.IsNull())
		{
			ToLoad.Add(Attachment->Mesh.ToSoftObjectPath());
		}
	}

	if (ToLoad.IsEmpty())
	{
		return;
	}

	CosmeticsLoadHandle = UAssetManager::GetStreamableManager().RequestAsyncLoad(
		ToLoad,
		FStreamableDelegate::CreateWeakLambda(this, [this, Weapon, Slot]() { OnCosmeticsLoaded(Weapon, Slot); }));
}

void UTFPSWeaponComponent::OnCosmeticsLoaded(const UTFPSWeaponDefinition* LoadedFor, int32 LoadedSlot)
{
	// The weapon may have changed while loading.
	if (LoadedFor != GetEquippedWeapon() || LoadedSlot != GetActiveSlot() || !Slots.IsValidIndex(LoadedSlot))
	{
		return;
	}

	const ATFPSCharacter* Character = Cast<ATFPSCharacter>(GetOwner());
	if (!Character)
	{
		return;
	}

	auto SpawnWeaponMesh = [this](USkeletalMesh* Mesh, USceneComponent* Parent, FName Socket) -> USkeletalMeshComponent*
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

	auto SpawnAttachments = [this, LoadedSlot](USkeletalMeshComponent* WeaponMesh, bool bFirstPerson)
	{
		if (!WeaponMesh)
		{
			return;
		}

		for (const UTFPSAttachmentDefinition* Attachment : Slots[LoadedSlot].Attachments)
		{
			UStaticMesh* Mesh = Attachment ? Attachment->Mesh.Get() : nullptr;
			if (!Mesh)
			{
				continue;
			}

			UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(GetOwner());
			Comp->SetStaticMesh(Mesh);
			Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Comp->SetupAttachment(WeaponMesh, Attachment->AttachSocket);
			if (bFirstPerson)
			{
				Comp->SetOnlyOwnerSee(true);
				Comp->CastShadow = false;
			}
			else
			{
				Comp->SetOwnerNoSee(true);
				Comp->bCastHiddenShadow = true;
			}
			Comp->RegisterComponent();
			AttachmentMeshes.Add(Comp);
		}
	};

	if (IsOwnerLocallyControlled())
	{
		FirstPersonWeaponMesh = SpawnWeaponMesh(LoadedFor->FirstPersonMesh.Get(), Character->GetMesh1P(), LoadedFor->FirstPersonAttachSocket);
		if (FirstPersonWeaponMesh)
		{
			FirstPersonWeaponMesh->SetOnlyOwnerSee(true);
			FirstPersonWeaponMesh->CastShadow = false;
			SpawnAttachments(FirstPersonWeaponMesh, true);
		}
	}

	ThirdPersonWeaponMesh = SpawnWeaponMesh(LoadedFor->ThirdPersonMesh.Get(), Character->GetMesh(), LoadedFor->ThirdPersonAttachSocket);
	if (ThirdPersonWeaponMesh)
	{
		ThirdPersonWeaponMesh->SetOwnerNoSee(true);
		ThirdPersonWeaponMesh->bCastHiddenShadow = true;
		SpawnAttachments(ThirdPersonWeaponMesh, false);
	}
}

void UTFPSWeaponComponent::DestroyCosmetics()
{
	for (UStaticMeshComponent* Comp : AttachmentMeshes)
	{
		if (Comp)
		{
			Comp->DestroyComponent();
		}
	}
	AttachmentMeshes.Reset();

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
