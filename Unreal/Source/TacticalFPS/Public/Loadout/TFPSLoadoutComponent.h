#pragma once

#include "Components/ActorComponent.h"
#include "CoreMinimal.h"
#include "Loadout/TFPSLoadoutTypes.h"

#include "TFPSLoadoutComponent.generated.h"

class ATFPSPlayerState;

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FTFPSLoadoutChangedSignature);

/**
 * Lives on ATFPSPlayerState, so the chosen loadout survives death and respawn.
 *
 * Flow:
 *   1. Owning client: RequestLoadout(IDs) -> ServerRequestLoadout (reliable, size-validated).
 *   2. Server: resolve each ID through the AssetManager registry, validate (slot types, allowed
 *      attachments, one per attachment slot, attachment cap, one perk per perk slot, equipment slot,
 *      unlock level), replace invalid pieces with DefaultLoadout's, store as ActiveLoadout.
 *   3. ActiveLoadout replicates to the owner only (UI shows what was actually accepted).
 *   4. Applied by ATFPSCharacter on its next spawn, or immediately if the player changed loadout
 *      within LoadoutChangeGraceSeconds of spawning.
 *
 * Nothing the client sends is trusted: it can only choose among registered items it has unlocked.
 */
UCLASS(Config = Game, ClassGroup = (TFPS))
class TACTICALFPS_API UTFPSLoadoutComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UTFPSLoadoutComponent(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	/** Owning client (or listen-server host): ask for a loadout. */
	UFUNCTION(BlueprintCallable, Category = "TFPS|Loadout")
	void RequestLoadout(const FTFPSLoadoutRequest& Request);

	/** Server: the validated loadout to apply; the default loadout until the player picks one. */
	const FTFPSLoadout& GetActiveLoadout();

	/** Any machine that receives it (server, owner). For UI. */
	UFUNCTION(BlueprintPure, Category = "TFPS|Loadout")
	const FTFPSLoadout& GetReplicatedLoadout() const { return ActiveLoadout; }

	/** Server: carry the loadout across seamless travel. */
	void CopyLoadoutFrom(const UTFPSLoadoutComponent& Other);

	UPROPERTY(BlueprintAssignable, Category = "TFPS|Loadout")
	FTFPSLoadoutChangedSignature OnLoadoutChanged;

protected:
	/** Fallback for new players and for any invalid part of a request. Must itself be valid. */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Loadout")
	FTFPSLoadoutRequest DefaultLoadout;

	/** A loadout change this soon after spawning re-equips immediately instead of waiting for respawn. */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Loadout", Meta = (Units = "s"))
	float LoadoutChangeGraceSeconds = 5.f;

	/** Requests closer together are ignored (reliable-RPC spam protection). */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Loadout", Meta = (Units = "s"))
	float MinSecondsBetweenRequests = 0.5f;

private:
	UFUNCTION(Server, Reliable, WithValidation)
	void ServerRequestLoadout(const FTFPSLoadoutRequest& Request);

	void ApplyRequest(const FTFPSLoadoutRequest& Request);

	/** Resolves and validates Request. Invalid pieces are left empty. Returns true if nothing was rejected. */
	bool ResolveLoadout(const FTFPSLoadoutRequest& Request, int32 UnlockLevel, FTFPSLoadout& Out) const;
	bool ResolveWeapon(const FTFPSWeaponLoadoutRequest& Request, ETFPSWeaponSlotType SlotType, int32 UnlockLevel, FTFPSWeaponSlot& Out) const;
	void FillMissingFromDefault(FTFPSLoadout& InOut);
	const FTFPSLoadout& GetResolvedDefault();

	int32 GetUnlockLevel() const;
	ATFPSPlayerState* GetPlayerState() const;

	void SetActiveLoadout(const FTFPSLoadout& NewLoadout);

	UFUNCTION()
	void OnRep_ActiveLoadout();

	UPROPERTY(ReplicatedUsing = OnRep_ActiveLoadout)
	FTFPSLoadout ActiveLoadout;

	/** Server: ActiveLoadout has been set (by request, default or travel). */
	bool bHasActiveLoadout = false;

	/** Server. */
	double LastRequestTime = -1.0e9;

	FTFPSLoadout ResolvedDefault;
	bool bDefaultResolved = false;
};
