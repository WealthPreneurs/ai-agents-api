#pragma once

#include "AbilitySystem/Abilities/TFPSGameplayAbility.h"
#include "CoreMinimal.h"

#include "TFPSWeaponGameplayAbility.generated.h"

class UTFPSWeaponDefinition;

/**
 * Base for abilities granted by a weapon (fire, ADS, reload). Every loadout weapon's abilities are
 * granted at spawn, with the weapon definition as the spec's SourceObject; this only allows activation
 * while that weapon is the active one. Two weapons can bind the same input tag without conflict, and a
 * swap needs no grant/revoke round trip before the new weapon can fire.
 */
UCLASS(Abstract)
class TACTICALFPS_API UTFPSWeaponGameplayAbility : public UTFPSGameplayAbility
{
	GENERATED_BODY()

public:
	UTFPSWeaponGameplayAbility(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~UGameplayAbility
	virtual bool CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const override;
	//~End UGameplayAbility

	/** The weapon that granted this ability. */
	const UTFPSWeaponDefinition* GetSourceWeapon() const;
};
