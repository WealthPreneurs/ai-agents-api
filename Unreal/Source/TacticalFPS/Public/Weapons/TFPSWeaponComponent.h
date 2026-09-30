#pragma once

#include "AbilitySystem/TFPSAbilitySet.h"
#include "Components/ActorComponent.h"
#include "CoreMinimal.h"
#include "Loadout/TFPSLoadoutTypes.h"

#include "TFPSWeaponComponent.generated.h"

class UAbilitySystemComponent;
class USkeletalMeshComponent;
class UStaticMeshComponent;
class UTFPSWeaponDefinition;
struct FStreamableHandle;

DECLARE_MULTICAST_DELEGATE_OneParam(FTFPSOnWeaponEquipped, const UTFPSWeaponDefinition* /*Weapon*/);

/**
 * Per-character weapon state for the loadout's weapon slots (primary, secondary). The server owns
 * everything; the owning client predicts ammo and weapon swaps.
 *
 * Replication:
 *  - Slots (weapon + attachments), ActiveSlot -> everyone (third-person visuals). Asset references only.
 *  - SlotStats, ammo, ServerAckedShotSeq       -> owner only. Enemies never learn stats or ammo.
 *
 * Ammo prediction mirrors CharacterMovement's saved moves: the client records each shot's sequence
 * number and slot, and shows  ServerAmmo[slot] - (unacked shots from that slot). A late server update
 * never "refunds" bullets on the HUD, and rejected shots self-correct because the server still acks
 * them without spending ammo.
 *
 * Swap prediction: the owning client sets PredictedActiveSlot immediately; the replicated ActiveSlot
 * clears it once it matches, and a rejected swap clears it via the prediction key's rejected delegate.
 * The server enforces equip time itself, so skipping the swap animation client-side gains nothing.
 */
UCLASS(ClassGroup = (TFPS), Meta = (BlueprintSpawnableComponent))
class TACTICALFPS_API UTFPSWeaponComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UTFPSWeaponComponent(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	// --- Server ---------------------------------------------------------------------------------

	/**
	 * Server only. Equips the loadout's weapons: builds each slot's stats (definition x attachments x
	 * GlobalModifiers from perks), fills ammo, and grants every weapon's ability set.
	 */
	void InitializeWeapons(UAbilitySystemComponent* ASC, const TArray<FTFPSWeaponSlot>& Loadout, const FTFPSWeaponStatModifiers& GlobalModifiers);

	/** Server only. Revokes weapon abilities. Slots stay so the corpse keeps its weapon visuals. */
	void UninitializeWeapons();

	/** Server only. Switches the active slot and starts its equip time. */
	void ServerSetActiveSlot(int32 NewSlot);

	/**
	 * Server only. Rate-limits shots with a token bucket: credits refill at the weapon's fire rate and
	 * cap at a small burst so jittery-but-honest clients (packets arriving bunched) are never rejected,
	 * while sustained over-rate fire is. Also refuses shots before the weapon's equip time has elapsed.
	 */
	bool ServerConsumeFireRateCredit();

	/** Server only. Spends one round for ShotSeq and acks it. Returns false (still acks) if empty. */
	bool ServerConsumeAmmo(uint16 ShotSeq);

	/** Server only. Acks a rejected shot without spending ammo, so the client's prediction converges. */
	void ServerRejectShot(uint16 ShotSeq);

	/** Server only. Moves rounds from reserve into the active magazine. */
	void ServerReload();

	// --- Owning client --------------------------------------------------------------------------

	/** Owning client. Returns the sequence number to stamp on the next shot and predicts its cost. */
	uint16 PredictShot();

	/** Owning client. Shows NewSlot immediately while the server confirms. */
	void PredictActiveSlot(int32 NewSlot);

	/** Owning client. Drops a swap prediction (bound to the swap's rejected-prediction delegate). */
	void ClearPredictedActiveSlot();

	// --- Queries --------------------------------------------------------------------------------

	int32 GetNumSlots() const { return Slots.Num(); }

	/** Active slot as this machine should see it (predicted on the owning client). */
	int32 GetActiveSlot() const { return PredictedActiveSlot != INDEX_NONE ? PredictedActiveSlot : ActiveSlot; }

	const UTFPSWeaponDefinition* GetEquippedWeapon() const;

	/** Effective stats of the active weapon. Null on machines that don't receive stats (simulated proxies). */
	const FTFPSWeaponStats* GetEquippedStats() const;

	/** Ammo as the local machine should see it (predicted on the owning client). */
	UFUNCTION(BlueprintPure, Category = "TFPS|Weapon")
	int32 GetAmmoInMagazine() const;

	UFUNCTION(BlueprintPure, Category = "TFPS|Weapon")
	int32 GetReserveAmmo() const;

	FTFPSOnWeaponEquipped OnWeaponEquipped;

	/**
	 * Rebuilds weapon meshes if the visible weapon changed (or always, if bForce). The owner forces this
	 * when its controller changes, because on a client the weapon can replicate before the controller
	 * does, and the first-person mesh depends on knowing we are locally controlled.
	 */
	void RefreshCosmetics(bool bForce = false);

protected:
	/** Shots a client may "bank" to absorb network jitter. Higher = more tolerant, easier to abuse. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Weapon|Validation", Meta = (ClampMin = 1))
	float MaxFireRateCredits = 3.f;

	/** Fraction of equip time the server enforces; the rest absorbs latency variance. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Weapon|Validation", Meta = (ClampMin = 0, ClampMax = 1))
	float EquipTimeTolerance = 0.8f;

private:
	UFUNCTION()
	void OnRep_Slots();

	UFUNCTION()
	void OnRep_ActiveSlot();

	bool IsOwnerLocallyControlled() const;
	void OnCosmeticsLoaded(const UTFPSWeaponDefinition* LoadedFor, int32 LoadedSlot);
	void DestroyCosmetics();

	UPROPERTY(ReplicatedUsing = OnRep_Slots)
	TArray<FTFPSWeaponSlot> Slots;

	UPROPERTY(ReplicatedUsing = OnRep_ActiveSlot)
	uint8 ActiveSlot = 0;

	UPROPERTY(Replicated)
	TArray<FTFPSWeaponStats> SlotStats;

	UPROPERTY(Replicated)
	TArray<int32> SlotAmmoInMag;

	UPROPERTY(Replicated)
	TArray<int32> SlotReserveAmmo;

	UPROPERTY(Replicated)
	uint16 ServerAckedShotSeq = 0;

	/** Owning client: swap shown before the server confirms it. */
	int32 PredictedActiveSlot = INDEX_NONE;

	/** Owning client: shots not yet acked by the server. */
	struct FPendingShot
	{
		uint16 Seq = 0;
		uint8 Slot = 0;
	};
	TArray<FPendingShot, TInlineAllocator<32>> PendingShots;
	uint16 LocalShotSeq = 0;

	/** Server: token-bucket and equip-time state. */
	float FireRateCredits = 0.f;
	double LastCreditRefillTime = 0.0;
	double WeaponReadyTime = 0.0;

	TWeakObjectPtr<UAbilitySystemComponent> AbilitySystemComponent;
	FTFPSAbilitySet_GrantedHandles WeaponGrantedHandles;

	/** What the spawned cosmetics currently show. */
	TWeakObjectPtr<const UTFPSWeaponDefinition> CosmeticWeapon;
	int32 CosmeticSlot = INDEX_NONE;

	UPROPERTY(Transient)
	TObjectPtr<USkeletalMeshComponent> FirstPersonWeaponMesh;

	UPROPERTY(Transient)
	TObjectPtr<USkeletalMeshComponent> ThirdPersonWeaponMesh;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UStaticMeshComponent>> AttachmentMeshes;

	TSharedPtr<FStreamableHandle> CosmeticsLoadHandle;
};
