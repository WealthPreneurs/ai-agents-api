#include "AbilitySystem/Abilities/TFPSGameplayAbility_ADS.h"

#include "Character/TFPSCharacter.h"
#include "Movement/TFPSCharacterMovementComponent.h"
#include "TFPSGameplayTags.h"
#include "Weapons/TFPSWeaponComponent.h"

UTFPSGameplayAbility_ADS::UTFPSGameplayAbility_ADS(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	FGameplayTagContainer AssetTags;
	AssetTags.AddTag(TFPSGameplayTags::Ability_Weapon_ADS);
	SetAssetTags(AssetTags);

	ActivationOwnedTags.AddTag(TFPSGameplayTags::State_ADS);
	CancelAbilitiesWithTag.AddTag(TFPSGameplayTags::Ability_Movement_Sprint);
}

void UTFPSGameplayAbility_ADS::ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData)
{
	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	const UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	const FTFPSWeaponStats* Stats = Weapons ? Weapons->GetEquippedStats() : nullptr;
	AimTime = Stats ? Stats->ADSTime : 0.f;

	if (ActorInfo->IsLocallyControlled())
	{
		if (ATFPSCharacter* Character = GetTFPSCharacterFromActorInfo())
		{
			Character->GetTFPSMovementComponent()->SetWantsToAim(true);
		}
		K2_OnAimStarted(AimTime);
	}
}

void UTFPSGameplayAbility_ADS::InputPressed(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo)
{
	Super::InputPressed(Handle, ActorInfo, ActivationInfo);

	// Only reached while already active (the first press activates), so in toggle mode this is "aim off".
	if (bToggle)
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
	}
}

void UTFPSGameplayAbility_ADS::InputReleased(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo)
{
	Super::InputReleased(Handle, ActorInfo, ActivationInfo);

	if (!bToggle)
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
	}
}

void UTFPSGameplayAbility_ADS::EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled)
{
	if (ActorInfo && ActorInfo->IsLocallyControlled() && IsActive())
	{
		if (ATFPSCharacter* Character = GetTFPSCharacterFromActorInfo())
		{
			Character->GetTFPSMovementComponent()->SetWantsToAim(false);
		}
		K2_OnAimEnded(AimTime);
	}

	Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}
