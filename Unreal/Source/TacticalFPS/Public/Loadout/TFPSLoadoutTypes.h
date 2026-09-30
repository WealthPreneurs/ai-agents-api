#pragma once

#include "CoreMinimal.h"
#include "UObject/PrimaryAssetId.h"

#include "TFPSLoadoutTypes.generated.h"

class UTFPSAttachmentDefinition;
class UTFPSEquipmentDefinition;
class UTFPSPerkDefinition;
class UTFPSWeaponDefinition;

UENUM(BlueprintType)
enum class ETFPSFireMode : uint8
{
	SemiAuto,
	Burst,
	FullAuto
};

UENUM(BlueprintType)
enum class ETFPSWeaponSlotType : uint8
{
	Primary,
	Secondary
};

/** One attachment per slot per weapon. Stored as a bitmask during validation, so keep < 32 entries. */
UENUM(BlueprintType)
enum class ETFPSAttachmentSlot : uint8
{
	Optic,
	Muzzle,
	Barrel,
	Underbarrel,
	Magazine,
	Stock,
	RearGrip,
	Laser
};

UENUM(BlueprintType)
enum class ETFPSPerkSlot : uint8
{
	Perk1,
	Perk2,
	Perk3
};

UENUM(BlueprintType)
enum class ETFPSEquipmentSlot : uint8
{
	Lethal,
	Tactical
};

/**
 * Stat changes from attachments and perks. Multipliers multiply, deltas add, so any number of sources
 * combine in any order with the same result.
 */
USTRUCT(BlueprintType)
struct TACTICALFPS_API FTFPSWeaponStatModifiers
{
	GENERATED_BODY()

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (ClampMin = 0))
	float DamageMultiplier = 1.f;

	/** Scales falloff ranges and max range. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (ClampMin = 0))
	float RangeMultiplier = 1.f;

	/** >1 fires faster. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (ClampMin = 0.1))
	float FireRateMultiplier = 1.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (ClampMin = 0))
	float HipSpreadMultiplier = 1.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (ClampMin = 0))
	float ADSSpreadMultiplier = 1.f;

	/** <1 reloads faster. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (ClampMin = 0.1))
	float ReloadTimeMultiplier = 1.f;

	/** <1 swaps faster. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (ClampMin = 0.1))
	float EquipTimeMultiplier = 1.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
	int32 MagazineSizeDelta = 0;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
	int32 ReserveAmmoDelta = 0;

	void Combine(const FTFPSWeaponStatModifiers& Other);
};

/**
 * Final stats for one weapon in one player's loadout: definition x attachments x perks. Computed on the
 * server and replicated to the owner only, so client prediction and server validation use identical
 * numbers and nobody else learns them.
 */
USTRUCT(BlueprintType)
struct TACTICALFPS_API FTFPSWeaponStats
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) ETFPSFireMode FireMode = ETFPSFireMode::FullAuto;
	UPROPERTY(BlueprintReadOnly) float FireInterval = 0.08f;
	UPROPERTY(BlueprintReadOnly) int32 BurstCount = 3;
	UPROPERTY(BlueprintReadOnly) float BurstCooldown = 0.2f;
	UPROPERTY(BlueprintReadOnly) int32 PelletsPerShot = 1;
	UPROPERTY(BlueprintReadOnly) float MaxRange = 10000.f;
	UPROPERTY(BlueprintReadOnly) float HipSpreadAngle = 3.f;
	UPROPERTY(BlueprintReadOnly) float ADSSpreadAngle = 0.25f;
	UPROPERTY(BlueprintReadOnly) int32 MagazineSize = 30;
	UPROPERTY(BlueprintReadOnly) int32 MaxReserveAmmo = 120;
	UPROPERTY(BlueprintReadOnly) float BaseDamage = 25.f;
	UPROPERTY(BlueprintReadOnly) float FalloffStartRange = 2500.f;
	UPROPERTY(BlueprintReadOnly) float FalloffEndRange = 5000.f;
	UPROPERTY(BlueprintReadOnly) float MinDamageMultiplier = 0.6f;
	UPROPERTY(BlueprintReadOnly) float ReloadTime = 2.2f;
	UPROPERTY(BlueprintReadOnly) float EquipTime = 0.4f;
};

/** A weapon plus its attachments, as equipped. Replicated to everyone (third-person visuals). */
USTRUCT(BlueprintType)
struct TACTICALFPS_API FTFPSWeaponSlot
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	TObjectPtr<const UTFPSWeaponDefinition> Weapon = nullptr;

	UPROPERTY(BlueprintReadOnly)
	TArray<TObjectPtr<const UTFPSAttachmentDefinition>> Attachments;
};

// --- Client -> server request: IDs only --------------------------------------------------------

USTRUCT(BlueprintType)
struct TACTICALFPS_API FTFPSWeaponLoadoutRequest
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Meta = (AllowedTypes = "TFPSWeapon"))
	FPrimaryAssetId Weapon;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Meta = (AllowedTypes = "TFPSAttachment"))
	TArray<FPrimaryAssetId> Attachments;
};

/**
 * What a client asks for. Built from the player's saved custom loadouts (menu / backend profile).
 * The server treats every field as untrusted.
 */
USTRUCT(BlueprintType)
struct TACTICALFPS_API FTFPSLoadoutRequest
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FTFPSWeaponLoadoutRequest Primary;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FTFPSWeaponLoadoutRequest Secondary;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Meta = (AllowedTypes = "TFPSPerk"))
	TArray<FPrimaryAssetId> Perks;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Meta = (AllowedTypes = "TFPSEquipment"))
	FPrimaryAssetId Lethal;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Meta = (AllowedTypes = "TFPSEquipment"))
	FPrimaryAssetId Tactical;
};

/** Server-validated, resolved loadout. Replicated to its owner only. */
USTRUCT(BlueprintType)
struct TACTICALFPS_API FTFPSLoadout
{
	GENERATED_BODY()

	/** [0] = primary, [1] = secondary. A null weapon means the slot is empty. */
	UPROPERTY(BlueprintReadOnly)
	TArray<FTFPSWeaponSlot> Weapons;

	UPROPERTY(BlueprintReadOnly)
	TArray<TObjectPtr<const UTFPSPerkDefinition>> Perks;

	UPROPERTY(BlueprintReadOnly)
	TObjectPtr<const UTFPSEquipmentDefinition> Lethal = nullptr;

	UPROPERTY(BlueprintReadOnly)
	TObjectPtr<const UTFPSEquipmentDefinition> Tactical = nullptr;
};
