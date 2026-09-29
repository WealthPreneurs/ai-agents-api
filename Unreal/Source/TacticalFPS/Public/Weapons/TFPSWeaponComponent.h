#pragma once

#include "AbilitySystem/TFPSAbilitySet.h"
#include "Components/ActorComponent.h"
#include "CoreMinimal.h"

#include "TFPSWeaponComponent.generated.h"

class UAbilitySystemComponent;
class USkeletalMeshComponent;
class UTFPSWeaponDefinition;
struct FStreamableHandle;

DECLARE_MULTICAST_DELEGATE_OneParam(FTFPSOnWeaponEquipped, const UTFPSWeaponDefinition* /*Weapon*/);

/**
 * Per-character weapon state. The server owns everything; the owning client predicts ammo.
 *
 * Replication:
 *  - EquippedWeapon      -> everyone (third-person visuals). A single asset reference.
 *  - AmmoInMag / Reserve -> owner only; enemies have no business knowing ammo counts.
 *  - ServerAckedShotSeq  -> owner only; the last shot sequence number the server has processed.
 *
 * Ammo prediction mirrors CharacterMovement's saved-move model instead of letting replication fight
 * the prediction: the client stamps each shot with a sequence number and shows
 *     ServerAmmo - (LocalShotSeq - ServerAckedShotSeq)
 * so a late server update never "refunds" bullets on the HUD, and rejected shots self-correct because
 * the server still acks their sequence without spending ammo.
 */
UCLASS(ClassGroup = (TFPS), Meta = (BlueprintSpawnableComponent))
class TACTICALFPS_API UTFPSWeaponComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UTFPSWeaponComponent(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	// --- Server ---------------------------------------------------------------------------------

	/** Server only. Equips DefaultWeapon (the loadout system will replace this). */
	void InitializeWeapons(UAbilitySystemComponent* ASC);

	/** Server only. Revokes the equipped weapon's abilities. */
	void UninitializeWeapons();

	/** Server only. Grants the weapon's ability set, fills the magazine and reserve. */
	void EquipWeapon(const UTFPSWeaponDefinition* NewWeapon);

	/**
	 * Server only. Rate-limits shots with a token bucket: credits refill at the weapon's fire rate and
	 * cap at a small burst so jittery-but-honest clients (packets arriving bunched) are never rejected,
	 * while sustained over-rate fire is.
	 */
	bool ServerConsumeFireRateCredit();

	/** Server only. Spends one round for ShotSeq and acks it. Returns false (still acks) if empty. */
	bool ServerConsumeAmmo(uint16 ShotSeq);

	/** Server only. Acks a rejected shot without spending ammo, so the client's prediction converges. */
	void ServerRejectShot(uint16 ShotSeq);

	/** Server only. Moves rounds from reserve into the magazine. */
	void ServerReload();

	// --- Owning client --------------------------------------------------------------------------

	/** Owning client. Returns the sequence number to stamp on the next shot and predicts its cost. */
	uint16 PredictShot();

	// --- Queries --------------------------------------------------------------------------------

	const UTFPSWeaponDefinition* GetEquippedWeapon() const { return EquippedWeapon; }

	/** Ammo as the local machine should see it (predicted on the owning client). */
	UFUNCTION(BlueprintPure, Category = "TFPS|Weapon")
	int32 GetAmmoInMagazine() const;

	UFUNCTION(BlueprintPure, Category = "TFPS|Weapon")
	int32 GetReserveAmmo() const { return ReserveAmmo; }

	FTFPSOnWeaponEquipped OnWeaponEquipped;

	/**
	 * Rebuilds weapon meshes. The owner calls this when its controller changes, because on a client the
	 * weapon can replicate before the controller does, and the first-person mesh depends on knowing we
	 * are locally controlled.
	 */
	void RefreshCosmetics();

protected:
	/** Weapon equipped on spawn until the loadout system exists. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Weapon")
	TObjectPtr<const UTFPSWeaponDefinition> DefaultWeapon;

	/** Shots a client may "bank" to absorb network jitter. Higher = more tolerant, easier to abuse. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Weapon|Validation", Meta = (ClampMin = 1))
	float MaxFireRateCredits = 3.f;

private:
	UFUNCTION()
	void OnRep_EquippedWeapon();

	bool IsOwnerLocallyControlled() const;
	void OnCosmeticsLoaded(const UTFPSWeaponDefinition* LoadedFor);
	void DestroyCosmetics();

	UPROPERTY(ReplicatedUsing = OnRep_EquippedWeapon)
	TObjectPtr<const UTFPSWeaponDefinition> EquippedWeapon;

	UPROPERTY(Replicated)
	int32 AmmoInMag = 0;

	UPROPERTY(Replicated)
	int32 ReserveAmmo = 0;

	UPROPERTY(Replicated)
	uint16 ServerAckedShotSeq = 0;

	/** Owning client: last sequence number handed out. */
	uint16 LocalShotSeq = 0;

	/** Server: token-bucket state. */
	float FireRateCredits = 0.f;
	double LastCreditRefillTime = 0.0;

	TWeakObjectPtr<UAbilitySystemComponent> AbilitySystemComponent;
	FTFPSAbilitySet_GrantedHandles WeaponGrantedHandles;

	UPROPERTY(Transient)
	TObjectPtr<USkeletalMeshComponent> FirstPersonWeaponMesh;

	UPROPERTY(Transient)
	TObjectPtr<USkeletalMeshComponent> ThirdPersonWeaponMesh;

	TSharedPtr<FStreamableHandle> CosmeticsLoadHandle;
};
