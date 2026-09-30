#pragma once

#include "AbilitySystem/Abilities/TFPSGameplayAbility.h"
#include "CoreMinimal.h"

#include "TFPSGameplayAbility_Sprint.generated.h"

/**
 * Sprint. Grant in the character's default ability set on InputTag.Movement.Sprint.
 *
 * - Movement: sets WantsToSprint on the movement component (owning client). The intent is sent with
 *   every saved move, and the component only applies sprint speed while on the ground, uncrouched, not
 *   aiming and moving forward, identically on client and server.
 * - State.Sprinting (ActivationOwnedTags) for gameplay rules / UI. Cancels ADS; firing and aiming cancel it.
 * - Toggle (CoD default): press to start; ends on a second press, or automatically once the player stops
 *   sprinting (stops moving forward, crouches, leaves the ground for too long).
 */
UCLASS()
class TACTICALFPS_API UTFPSGameplayAbility_Sprint : public UTFPSGameplayAbility
{
	GENERATED_BODY()

public:
	UTFPSGameplayAbility_Sprint(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~UGameplayAbility
	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData) override;
	virtual void EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled) override;
	virtual void InputPressed(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo) override;
	virtual void InputReleased(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo) override;
	//~End UGameplayAbility

protected:
	/** true = press to toggle (default), false = hold to sprint. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Sprint")
	bool bToggle = true;

	/** How long sprint may be requested without actually sprinting (e.g. mid-jump) before it ends. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Sprint", Meta = (ClampMin = 0, Units = "s"))
	float NotSprintingGraceTime = 0.3f;

private:
	void CheckStillSprinting();

	FTimerHandle CheckTimerHandle;
	float TimeNotSprinting = 0.f;

	static constexpr float CheckInterval = 0.1f;
};
