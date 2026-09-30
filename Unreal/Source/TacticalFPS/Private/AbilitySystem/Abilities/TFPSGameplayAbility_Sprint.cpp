#include "AbilitySystem/Abilities/TFPSGameplayAbility_Sprint.h"

#include "Character/TFPSCharacter.h"
#include "Engine/World.h"
#include "Movement/TFPSCharacterMovementComponent.h"
#include "TFPSGameplayTags.h"
#include "TimerManager.h"

UTFPSGameplayAbility_Sprint::UTFPSGameplayAbility_Sprint(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	FGameplayTagContainer AssetTags;
	AssetTags.AddTag(TFPSGameplayTags::Ability_Movement_Sprint);
	SetAssetTags(AssetTags);

	ActivationOwnedTags.AddTag(TFPSGameplayTags::State_Sprinting);
	CancelAbilitiesWithTag.AddTag(TFPSGameplayTags::Ability_Weapon_ADS);
}

void UTFPSGameplayAbility_Sprint::ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData)
{
	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Only the owner drives movement intent and decides when sprint ends; the server's copy just holds
	// State.Sprinting until the client's end arrives. Speed itself is validated by the movement component.
	if (!ActorInfo->IsLocallyControlled())
	{
		return;
	}

	if (ATFPSCharacter* Character = GetTFPSCharacterFromActorInfo())
	{
		Character->GetTFPSMovementComponent()->SetWantsToSprint(true);
	}

	TimeNotSprinting = 0.f;
	GetWorld()->GetTimerManager().SetTimer(CheckTimerHandle, this, &ThisClass::CheckStillSprinting, CheckInterval, true);
}

void UTFPSGameplayAbility_Sprint::CheckStillSprinting()
{
	const ATFPSCharacter* Character = GetTFPSCharacterFromActorInfo();
	if (!Character || !IsActive())
	{
		return;
	}

	if (Character->GetTFPSMovementComponent()->IsSprinting())
	{
		TimeNotSprinting = 0.f;
		return;
	}

	TimeNotSprinting += CheckInterval;
	if (TimeNotSprinting >= NotSprintingGraceTime)
	{
		K2_EndAbility();
	}
}

void UTFPSGameplayAbility_Sprint::InputPressed(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo)
{
	Super::InputPressed(Handle, ActorInfo, ActivationInfo);

	if (bToggle)
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
	}
}

void UTFPSGameplayAbility_Sprint::InputReleased(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo)
{
	Super::InputReleased(Handle, ActorInfo, ActivationInfo);

	if (!bToggle)
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
	}
}

void UTFPSGameplayAbility_Sprint::EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled)
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(CheckTimerHandle);
	}

	if (ActorInfo && ActorInfo->IsLocallyControlled())
	{
		if (ATFPSCharacter* Character = GetTFPSCharacterFromActorInfo())
		{
			Character->GetTFPSMovementComponent()->SetWantsToSprint(false);
		}
	}

	Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}
