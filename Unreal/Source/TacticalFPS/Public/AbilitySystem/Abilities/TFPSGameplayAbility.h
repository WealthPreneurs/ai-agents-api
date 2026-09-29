#pragma once

#include "Abilities/GameplayAbility.h"
#include "CoreMinimal.h"

#include "TFPSGameplayAbility.generated.h"

class ATFPSCharacter;
class UTFPSAbilitySystemComponent;
class UTFPSWeaponComponent;

/**
 * Project base ability. Defaults to instanced-per-actor + local-predicted, and is blocked while dead.
 */
UCLASS(Abstract)
class TACTICALFPS_API UTFPSGameplayAbility : public UGameplayAbility
{
	GENERATED_BODY()

public:
	UTFPSGameplayAbility(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	UFUNCTION(BlueprintPure, Category = "TFPS|Ability")
	ATFPSCharacter* GetTFPSCharacterFromActorInfo() const;

	UFUNCTION(BlueprintPure, Category = "TFPS|Ability")
	UTFPSWeaponComponent* GetWeaponComponentFromActorInfo() const;

	UTFPSAbilitySystemComponent* GetTFPSAbilitySystemComponentFromActorInfo() const;
};
