#pragma once

#include "CoreMinimal.h"
#include "Loadout/TFPSLoadoutItemDefinition.h"
#include "Loadout/TFPSLoadoutTypes.h"

#include "TFPSWeaponDefinition.generated.h"

class UGameplayEffect;
class USkeletalMesh;
class UTFPSAbilitySet;
class UTFPSAttachmentDefinition;

/**
 * Static, shared description of a weapon's base stats. Never mutated at runtime and never duplicated per
 * player. The effective stats for one player (after attachments and perks) are an FTFPSWeaponStats built
 * by BuildStats on the server; per-player state (ammo) lives on UTFPSWeaponComponent. Replicates as a
 * stable asset reference, i.e. a NetGUID, not its contents.
 *
 * Gameplay stats are hard references (the server needs them). Cosmetics are soft references so a
 * dedicated server never loads meshes, and clients load them asynchronously on equip.
 */
UCLASS(BlueprintType, Const)
class TACTICALFPS_API UTFPSWeaponDefinition : public UTFPSLoadoutItemDefinition
{
	GENERATED_BODY()

public:
	virtual FPrimaryAssetType GetLoadoutItemType() const override { return TFPSLoadoutAssetTypes::Weapon(); }

	/** Base stats with Modifiers applied, clamped to sane ranges. */
	FTFPSWeaponStats BuildStats(const FTFPSWeaponStatModifiers& Modifiers) const;

	/** Server-side damage for one pellet: base damage x range falloff x hit-zone multiplier. */
	float CalculateDamage(const FTFPSWeaponStats& Stats, float Distance, FName HitBone) const;

	// --- Loadout --------------------------------------------------------------------------------

	UPROPERTY(EditDefaultsOnly, Category = "Loadout")
	ETFPSWeaponSlotType SlotType = ETFPSWeaponSlotType::Primary;

	/** The only attachments the server will accept on this weapon. */
	UPROPERTY(EditDefaultsOnly, Category = "Loadout")
	TArray<TObjectPtr<const UTFPSAttachmentDefinition>> AllowedAttachments;

	UPROPERTY(EditDefaultsOnly, Category = "Loadout", Meta = (ClampMin = 0, ClampMax = 8))
	int32 MaxAttachments = 5;

	// --- Grants ---------------------------------------------------------------------------------

	/**
	 * Fire / ADS / reload abilities (with input tags). Granted for both loadout slots at spawn with this
	 * definition as SourceObject; UTFPSWeaponGameplayAbility only lets them activate while this weapon
	 * is the active one, so a swap never waits on the server to grant anything.
	 */
	UPROPERTY(EditDefaultsOnly, Category = "Abilities")
	TObjectPtr<const UTFPSAbilitySet> AbilitySet;

	/** Instant GE adding SetByCaller.Damage to IncomingDamage on the target. */
	UPROPERTY(EditDefaultsOnly, Category = "Damage")
	TSubclassOf<UGameplayEffect> DamageEffect;

	// --- Firing ---------------------------------------------------------------------------------

	UPROPERTY(EditDefaultsOnly, Category = "Firing")
	ETFPSFireMode FireMode = ETFPSFireMode::FullAuto;

	UPROPERTY(EditDefaultsOnly, Category = "Firing", Meta = (ClampMin = 1))
	float RoundsPerMinute = 750.f;

	UPROPERTY(EditDefaultsOnly, Category = "Firing", Meta = (ClampMin = 2, EditCondition = "FireMode == ETFPSFireMode::Burst"))
	int32 BurstCount = 3;

	/** Extra delay after a burst before the next one can start. */
	UPROPERTY(EditDefaultsOnly, Category = "Firing", Meta = (ClampMin = 0, EditCondition = "FireMode == ETFPSFireMode::Burst"))
	float BurstCooldown = 0.2f;

	/** >1 for shotguns. Each pellet is traced separately; hits on one target are summed into one GE. */
	UPROPERTY(EditDefaultsOnly, Category = "Firing", Meta = (ClampMin = 1, ClampMax = 16))
	int32 PelletsPerShot = 1;

	UPROPERTY(EditDefaultsOnly, Category = "Firing", Meta = (ClampMin = 100, Units = "cm"))
	float MaxRange = 10000.f;

	/** Cone half-angle while hip firing. */
	UPROPERTY(EditDefaultsOnly, Category = "Firing", Meta = (ClampMin = 0, Units = "deg"))
	float HipSpreadAngle = 3.f;

	/** Cone half-angle while State.ADS is present. */
	UPROPERTY(EditDefaultsOnly, Category = "Firing", Meta = (ClampMin = 0, Units = "deg"))
	float ADSSpreadAngle = 0.25f;

	// --- Handling -------------------------------------------------------------------------------

	UPROPERTY(EditDefaultsOnly, Category = "Handling", Meta = (ClampMin = 0, Units = "s"))
	float ReloadTime = 2.2f;

	/** Time to swap to this weapon. Enforced on the server (see UTFPSWeaponComponent). */
	UPROPERTY(EditDefaultsOnly, Category = "Handling", Meta = (ClampMin = 0, Units = "s"))
	float EquipTime = 0.4f;

	// --- Ammo -----------------------------------------------------------------------------------

	UPROPERTY(EditDefaultsOnly, Category = "Ammo", Meta = (ClampMin = 1))
	int32 MagazineSize = 30;

	UPROPERTY(EditDefaultsOnly, Category = "Ammo", Meta = (ClampMin = 0))
	int32 MaxReserveAmmo = 120;

	// --- Damage ---------------------------------------------------------------------------------

	UPROPERTY(EditDefaultsOnly, Category = "Damage", Meta = (ClampMin = 0))
	float BaseDamage = 25.f;

	/** Full damage up to this range. */
	UPROPERTY(EditDefaultsOnly, Category = "Damage", Meta = (ClampMin = 0, Units = "cm"))
	float FalloffStartRange = 2500.f;

	/** MinDamageMultiplier from this range on; linear in between. */
	UPROPERTY(EditDefaultsOnly, Category = "Damage", Meta = (ClampMin = 0, Units = "cm"))
	float FalloffEndRange = 5000.f;

	UPROPERTY(EditDefaultsOnly, Category = "Damage", Meta = (ClampMin = 0, ClampMax = 1))
	float MinDamageMultiplier = 0.6f;

	/** Physics-asset body (bone) name -> multiplier, e.g. head = 1.5, calf_l = 0.9. Missing = 1. */
	UPROPERTY(EditDefaultsOnly, Category = "Damage")
	TMap<FName, float> BoneDamageMultipliers;

	// --- Cosmetics (client only, async loaded) -------------------------------------------------

	UPROPERTY(EditDefaultsOnly, Category = "Cosmetics")
	TSoftObjectPtr<USkeletalMesh> FirstPersonMesh;

	UPROPERTY(EditDefaultsOnly, Category = "Cosmetics")
	TSoftObjectPtr<USkeletalMesh> ThirdPersonMesh;

	UPROPERTY(EditDefaultsOnly, Category = "Cosmetics")
	FName FirstPersonAttachSocket = TEXT("GripPoint");

	UPROPERTY(EditDefaultsOnly, Category = "Cosmetics")
	FName ThirdPersonAttachSocket = TEXT("weapon_r");
};
