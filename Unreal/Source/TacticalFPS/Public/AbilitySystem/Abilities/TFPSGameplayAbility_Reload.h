#pragma once

#include "AbilitySystem/Abilities/TFPSWeaponGameplayAbility.h"
#include "CoreMinimal.h"

#include "TFPSGameplayAbility_Reload.generated.h"

/**
 * Predicted, server-timed reload. Grant in each weapon's ability set on InputTag.Weapon.Reload.
 *
 * Owning client: plays the reload (K2_OnReloadStarted), and after ReloadTime predicts the refilled
 *                magazine, signals the server (GenericSignalFromClient) and ends.
 * Server:        measures elapsed time from its own activation. The signal and the activation cross
 *                the same network path, so latency cancels out and an honest client arrives at
 *                ~ReloadTime. Ammo moves only once ReloadTimeTolerance x ReloadTime has elapsed on the
 *                server; a client that signals early simply waits (or loses the reload if it also
 *                ends early). Speed-hacked reloads gain nothing.
 * Cancelling:    firing (reload cancel), swapping, death or round end cancel it before the signal, so no
 *                ammo moves and nothing was predicted.
 * State.Reloading (ActivationOwnedTags) is on while reloading.
 */
UCLASS()
class TACTICALFPS_API UTFPSGameplayAbility_Reload : public UTFPSWeaponGameplayAbility
{
	GENERATED_BODY()

public:
	UTFPSGameplayAbility_Reload(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~UGameplayAbility
	virtual bool CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const override;
	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData) override;
	virtual void EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled) override;
	//~End UGameplayAbility

protected:
	/** Local presentation: 1P reload montage, audio. Owning client / host only. For other players' 3P
	 *  animation, execute a gameplay cue from Blueprint. */
	UFUNCTION(BlueprintImplementableEvent, Category = "TFPS|Reload", Meta = (DisplayName = "On Reload Started"))
	void K2_OnReloadStarted(float ReloadTime);

	/** Fraction of ReloadTime that must elapse on the server before ammo moves. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Reload|Validation", Meta = (ClampMin = 0, ClampMax = 1))
	float ReloadTimeTolerance = 0.8f;

private:
	void OnLocalReloadFinished();
	void OnServerReloadSignal();
	void CompleteServerReload();

	FTimerHandle ReloadTimerHandle;
	FDelegateHandle SignalDelegateHandle;
	float ReloadDuration = 0.f;
	double ServerActivationTime = 0.0;
	bool bServerReloadDone = false;
};
