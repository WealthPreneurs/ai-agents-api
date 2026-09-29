#pragma once

#include "ActiveGameplayEffectHandle.h"
#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "GameplayAbilitySpecHandle.h"
#include "GameplayTagContainer.h"

#include "TFPSAbilitySet.generated.h"

class UAbilitySystemComponent;
class UGameplayAbility;
class UGameplayEffect;

USTRUCT(BlueprintType)
struct FTFPSAbilitySet_GameplayAbility
{
	GENERATED_BODY()

	UPROPERTY(EditDefaultsOnly)
	TSubclassOf<UGameplayAbility> Ability;

	UPROPERTY(EditDefaultsOnly)
	int32 AbilityLevel = 1;

	/** Input that activates this ability. Leave empty for passive / event-triggered abilities. */
	UPROPERTY(EditDefaultsOnly, Meta = (Categories = "InputTag"))
	FGameplayTag InputTag;
};

USTRUCT(BlueprintType)
struct FTFPSAbilitySet_GameplayEffect
{
	GENERATED_BODY()

	UPROPERTY(EditDefaultsOnly)
	TSubclassOf<UGameplayEffect> GameplayEffect;

	UPROPERTY(EditDefaultsOnly)
	float EffectLevel = 1.f;
};

/** Everything one GiveToAbilitySystem call granted, so it can be revoked as a unit. Server only. */
USTRUCT(BlueprintType)
struct FTFPSAbilitySet_GrantedHandles
{
	GENERATED_BODY()

	void AddAbilitySpecHandle(const FGameplayAbilitySpecHandle& Handle);
	void AddGameplayEffectHandle(const FActiveGameplayEffectHandle& Handle);

	/** Removes granted abilities and duration/infinite effects. Instant effects have nothing to undo. */
	void TakeFromAbilitySystem(UAbilitySystemComponent* ASC);

private:
	UPROPERTY()
	TArray<FGameplayAbilitySpecHandle> AbilitySpecHandles;

	UPROPERTY()
	TArray<FActiveGameplayEffectHandle> GameplayEffectHandles;
};

/**
 * A bundle of abilities and effects granted together: the character's base kit now, and weapons,
 * perks and field upgrades later. Granting happens on the server only; clients receive the specs
 * through ASC replication.
 */
UCLASS(BlueprintType, Const)
class TACTICALFPS_API UTFPSAbilitySet : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	void GiveToAbilitySystem(UAbilitySystemComponent* ASC, FTFPSAbilitySet_GrantedHandles* OutGrantedHandles, UObject* SourceObject = nullptr) const;

protected:
	UPROPERTY(EditDefaultsOnly, Category = "Abilities", Meta = (TitleProperty = "Ability"))
	TArray<FTFPSAbilitySet_GameplayAbility> GrantedAbilities;

	/** Applied in order. Put the attribute reset (instant, e.g. Health = MaxHealth) here for respawns. */
	UPROPERTY(EditDefaultsOnly, Category = "Effects", Meta = (TitleProperty = "GameplayEffect"))
	TArray<FTFPSAbilitySet_GameplayEffect> GrantedEffects;
};
