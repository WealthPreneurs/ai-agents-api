#pragma once

#include "AbilitySystem/Abilities/TFPSWeaponGameplayAbility.h"
#include "CoreMinimal.h"

#include "TFPSGameplayAbility_ADS.generated.h"

/**
 * Aim down sights. Grant in each weapon's ability set on InputTag.Weapon.ADS.
 *
 * - State.ADS (ActivationOwnedTags) switches the fire ability to ADS spread on both client and server.
 * - Movement: sets WantsToAim on the movement component (owning client), which is sent with every
 *   saved move, so the ADS speed penalty is predicted with no corrections.
 * - Cancels sprint; sprinting cancels ADS. Swapping weapons cancels it.
 * - Camera FOV / weapon offset blend is presentation: K2_OnAimStarted / K2_OnAimEnded with the weapon's
 *   ADSTime (after attachments and perks).
 */
UCLASS()
class TACTICALFPS_API UTFPSGameplayAbility_ADS : public UTFPSWeaponGameplayAbility
{
	GENERATED_BODY()

public:
	UTFPSGameplayAbility_ADS(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

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
	UFUNCTION(BlueprintImplementableEvent, Category = "TFPS|ADS", Meta = (DisplayName = "On Aim Started"))
	void K2_OnAimStarted(float AimTime);

	UFUNCTION(BlueprintImplementableEvent, Category = "TFPS|ADS", Meta = (DisplayName = "On Aim Ended"))
	void K2_OnAimEnded(float AimTime);

	/** false = hold to aim (default), true = press to toggle. Could be driven by a player setting. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|ADS")
	bool bToggle = false;

private:
	float AimTime = 0.f;
};
