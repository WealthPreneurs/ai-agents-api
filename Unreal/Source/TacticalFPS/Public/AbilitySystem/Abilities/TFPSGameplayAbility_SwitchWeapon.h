#pragma once

#include "AbilitySystem/Abilities/TFPSGameplayAbility.h"
#include "CoreMinimal.h"

#include "TFPSGameplayAbility_SwitchWeapon.generated.h"

/**
 * Cycles to the next loadout weapon. Grant via the character's default ability set on
 * InputTag.Weapon.Switch.
 *
 * Owning client: predicts the new active slot immediately (visuals, HUD, which weapon abilities may
 *                activate) and binds the prediction key's rejected delegate to roll it back.
 * Server:        switches authoritatively and starts the equip-time lockout in UTFPSWeaponComponent.
 * Both:          State.SwitchingWeapon (ActivationOwnedTags) blocks weapon abilities until equip time
 *                elapses; activating cancels fire / reload / ADS.
 */
UCLASS()
class TACTICALFPS_API UTFPSGameplayAbility_SwitchWeapon : public UTFPSGameplayAbility
{
	GENERATED_BODY()

public:
	UTFPSGameplayAbility_SwitchWeapon(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~UGameplayAbility
	virtual bool CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const override;
	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData) override;
	virtual void EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled) override;
	//~End UGameplayAbility

private:
	FTimerHandle EquipTimerHandle;
};
