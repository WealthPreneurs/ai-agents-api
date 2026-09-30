#include "Loadout/TFPSLoadoutComponent.h"

#include "Character/TFPSCharacter.h"
#include "Engine/AssetManager.h"
#include "Game/TFPSGameMode.h"
#include "Loadout/TFPSAttachmentDefinition.h"
#include "Loadout/TFPSEquipmentDefinition.h"
#include "Loadout/TFPSPerkDefinition.h"
#include "Net/Core/PushModel/PushModel.h"
#include "Net/UnrealNetwork.h"
#include "Player/TFPSPlayerState.h"
#include "TacticalFPS.h"
#include "Weapons/TFPSWeaponDefinition.h"

namespace TFPSLoadout
{
	// Upper bounds for RPC validation. Anything larger is not a UI bug but a forged packet.
	static constexpr int32 MaxAttachmentIds = 16;
	static constexpr int32 MaxPerkIds = 8;

	/**
	 * Resolve an ID the client sent. Only IDs registered with the AssetManager (i.e. items under the
	 * configured scan directories) of the expected type can resolve. The server preloads all loadout
	 * items (ATFPSGameMode::InitGame), so the synchronous fallback should never actually hit disk.
	 */
	template <typename T>
	const T* ResolveItem(const FPrimaryAssetId& Id, const FPrimaryAssetType& ExpectedType)
	{
		if (!Id.IsValid() || Id.PrimaryAssetType != ExpectedType)
		{
			return nullptr;
		}

		UAssetManager& AssetManager = UAssetManager::Get();
		if (UObject* Loaded = AssetManager.GetPrimaryAssetObject(Id))
		{
			return Cast<T>(Loaded);
		}

		const FSoftObjectPath Path = AssetManager.GetPrimaryAssetPath(Id);
		if (!Path.IsValid())
		{
			return nullptr; // Not a registered item.
		}

		UE_LOG(LogTFPS, Warning, TEXT("Loadout item %s was not preloaded; loading synchronously."), *Id.ToString());
		return Cast<T>(Path.TryLoad());
	}

	bool IsUnlocked(const UTFPSLoadoutItemDefinition* Item, int32 UnlockLevel)
	{
		return Item && Item->UnlockLevel <= UnlockLevel;
	}
}

UTFPSLoadoutComponent::UTFPSLoadoutComponent(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	PrimaryComponentTick.bCanEverTick = false;
	SetIsReplicatedByDefault(true);
}

void UTFPSLoadoutComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	FDoRepLifetimeParams Params;
	Params.bIsPushBased = true;
	Params.Condition = COND_OwnerOnly;
	DOREPLIFETIME_WITH_PARAMS_FAST(UTFPSLoadoutComponent, ActiveLoadout, Params);
}

// --- Requests -----------------------------------------------------------------------------------

void UTFPSLoadoutComponent::RequestLoadout(const FTFPSLoadoutRequest& Request)
{
	if (GetOwner()->HasAuthority())
	{
		ApplyRequest(Request); // Listen-server host.
	}
	else
	{
		ServerRequestLoadout(Request);
	}
}

bool UTFPSLoadoutComponent::ServerRequestLoadout_Validate(const FTFPSLoadoutRequest& Request)
{
	// Returning false disconnects the client, so only reject what no legitimate client can send.
	return Request.Primary.Attachments.Num() <= TFPSLoadout::MaxAttachmentIds
		&& Request.Secondary.Attachments.Num() <= TFPSLoadout::MaxAttachmentIds
		&& Request.Perks.Num() <= TFPSLoadout::MaxPerkIds;
}

void UTFPSLoadoutComponent::ServerRequestLoadout_Implementation(const FTFPSLoadoutRequest& Request)
{
	ApplyRequest(Request);
}

void UTFPSLoadoutComponent::ApplyRequest(const FTFPSLoadoutRequest& Request)
{
	check(GetOwner()->HasAuthority());

	const double Now = GetWorld()->GetTimeSeconds();
	if (Now - LastRequestTime < MinSecondsBetweenRequests)
	{
		UE_LOG(LogTFPS, Verbose, TEXT("[%s] loadout request ignored: too frequent."), *GetNameSafe(GetOwner()));
		return;
	}
	LastRequestTime = Now;

	FTFPSLoadout Resolved;
	if (!ResolveLoadout(Request, GetUnlockLevel(), Resolved))
	{
		// Common after a content update (stale saved loadout) and expected from tampered clients.
		UE_LOG(LogTFPS, Log, TEXT("[%s] loadout request partially rejected; invalid pieces replaced with defaults."), *GetNameSafe(GetOwner()));
	}
	FillMissingFromDefault(Resolved);

	SetActiveLoadout(Resolved);

	// Changing class right after spawning re-equips on the spot.
	ATFPSPlayerState* PS = GetPlayerState();
	if (ATFPSCharacter* Character = PS ? PS->GetPawn<ATFPSCharacter>() : nullptr)
	{
		if (Character->CanReapplyLoadout(LoadoutChangeGraceSeconds))
		{
			Character->ReapplyLoadout();
		}
	}
}

const FTFPSLoadout& UTFPSLoadoutComponent::GetActiveLoadout()
{
	if (!bHasActiveLoadout && GetOwner()->HasAuthority())
	{
		SetActiveLoadout(GetResolvedDefault());
	}
	return ActiveLoadout;
}

void UTFPSLoadoutComponent::CopyLoadoutFrom(const UTFPSLoadoutComponent& Other)
{
	if (Other.bHasActiveLoadout)
	{
		SetActiveLoadout(Other.ActiveLoadout);
	}
}

void UTFPSLoadoutComponent::SetActiveLoadout(const FTFPSLoadout& NewLoadout)
{
	ActiveLoadout = NewLoadout;
	bHasActiveLoadout = true;
	MARK_PROPERTY_DIRTY_FROM_NAME(UTFPSLoadoutComponent, ActiveLoadout, this);
	OnRep_ActiveLoadout();
}

void UTFPSLoadoutComponent::OnRep_ActiveLoadout()
{
	OnLoadoutChanged.Broadcast();
}

// --- Validation ---------------------------------------------------------------------------------

bool UTFPSLoadoutComponent::ResolveLoadout(const FTFPSLoadoutRequest& Request, int32 UnlockLevel, FTFPSLoadout& Out) const
{
	bool bClean = true;

	Out.Weapons.SetNum(2);
	bClean &= ResolveWeapon(Request.Primary, ETFPSWeaponSlotType::Primary, UnlockLevel, Out.Weapons[0]);
	bClean &= ResolveWeapon(Request.Secondary, ETFPSWeaponSlotType::Secondary, UnlockLevel, Out.Weapons[1]);

	uint32 UsedPerkSlots = 0;
	for (const FPrimaryAssetId& Id : Request.Perks)
	{
		const UTFPSPerkDefinition* Perk = TFPSLoadout::ResolveItem<UTFPSPerkDefinition>(Id, TFPSLoadoutAssetTypes::Perk());
		const uint32 SlotBit = Perk ? 1u << static_cast<uint32>(Perk->Slot) : 0u;
		if (!TFPSLoadout::IsUnlocked(Perk, UnlockLevel) || (UsedPerkSlots & SlotBit))
		{
			bClean = false;
			continue;
		}
		UsedPerkSlots |= SlotBit;
		Out.Perks.Add(Perk);
	}

	auto ResolveEquipment = [&](const FPrimaryAssetId& Id, ETFPSEquipmentSlot Slot) -> const UTFPSEquipmentDefinition*
	{
		if (!Id.IsValid())
		{
			return nullptr; // Deliberately empty.
		}

		const UTFPSEquipmentDefinition* Item = TFPSLoadout::ResolveItem<UTFPSEquipmentDefinition>(Id, TFPSLoadoutAssetTypes::Equipment());
		if (!TFPSLoadout::IsUnlocked(Item, UnlockLevel) || Item->Slot != Slot)
		{
			bClean = false;
			return nullptr;
		}
		return Item;
	};

	Out.Lethal = ResolveEquipment(Request.Lethal, ETFPSEquipmentSlot::Lethal);
	Out.Tactical = ResolveEquipment(Request.Tactical, ETFPSEquipmentSlot::Tactical);

	return bClean;
}

bool UTFPSLoadoutComponent::ResolveWeapon(const FTFPSWeaponLoadoutRequest& Request, ETFPSWeaponSlotType SlotType, int32 UnlockLevel, FTFPSWeaponSlot& Out) const
{
	Out = FTFPSWeaponSlot();

	const UTFPSWeaponDefinition* Weapon = TFPSLoadout::ResolveItem<UTFPSWeaponDefinition>(Request.Weapon, TFPSLoadoutAssetTypes::Weapon());
	if (!TFPSLoadout::IsUnlocked(Weapon, UnlockLevel) || Weapon->SlotType != SlotType)
	{
		return false;
	}

	Out.Weapon = Weapon;

	bool bClean = true;
	uint32 UsedAttachmentSlots = 0;

	for (const FPrimaryAssetId& Id : Request.Attachments)
	{
		const UTFPSAttachmentDefinition* Attachment = TFPSLoadout::ResolveItem<UTFPSAttachmentDefinition>(Id, TFPSLoadoutAssetTypes::Attachment());
		const uint32 SlotBit = Attachment ? 1u << static_cast<uint32>(Attachment->Slot) : 0u;

		const bool bValid = TFPSLoadout::IsUnlocked(Attachment, UnlockLevel)
			&& Weapon->AllowedAttachments.Contains(Attachment)
			&& !(UsedAttachmentSlots & SlotBit)
			&& Out.Attachments.Num() < Weapon->MaxAttachments;

		if (!bValid)
		{
			bClean = false;
			continue;
		}

		UsedAttachmentSlots |= SlotBit;
		Out.Attachments.Add(Attachment);
	}

	return bClean;
}

void UTFPSLoadoutComponent::FillMissingFromDefault(FTFPSLoadout& InOut)
{
	const FTFPSLoadout& Default = GetResolvedDefault();

	InOut.Weapons.SetNum(2);
	for (int32 Slot = 0; Slot < 2; ++Slot)
	{
		if (!InOut.Weapons[Slot].Weapon && Default.Weapons.IsValidIndex(Slot))
		{
			InOut.Weapons[Slot] = Default.Weapons[Slot];
		}
	}
}

const FTFPSLoadout& UTFPSLoadoutComponent::GetResolvedDefault()
{
	if (!bDefaultResolved)
	{
		bDefaultResolved = true;

		// The default is configured by designers, not chosen by players: no unlock requirement.
		if (!ResolveLoadout(DefaultLoadout, MAX_int32, ResolvedDefault) || !ResolvedDefault.Weapons[0].Weapon)
		{
			UE_LOG(LogTFPS, Error, TEXT("DefaultLoadout on %s is invalid or has no primary weapon; check [/Script/TacticalFPS.TFPSLoadoutComponent] in DefaultGame.ini."),
				*GetNameSafe(GetClass()));
		}
	}
	return ResolvedDefault;
}

int32 UTFPSLoadoutComponent::GetUnlockLevel() const
{
	const ATFPSGameMode* GameMode = GetWorld()->GetAuthGameMode<ATFPSGameMode>();
	return GameMode ? GameMode->GetUnlockLevel(GetPlayerState()) : MAX_int32;
}

ATFPSPlayerState* UTFPSLoadoutComponent::GetPlayerState() const
{
	return Cast<ATFPSPlayerState>(GetOwner());
}
