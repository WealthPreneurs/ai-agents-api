#include "AbilitySystem/Abilities/TFPSGameplayAbility.h"

#include "AbilitySystem/TFPSAbilitySystemComponent.h"
#include "Character/TFPSCharacter.h"
#include "TFPSGameplayTags.h"
#include "Weapons/TFPSWeaponComponent.h"

UTFPSGameplayAbility::UTFPSGameplayAbility(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::LocalPredicted;
	ReplicationPolicy = EGameplayAbilityReplicationPolicy::ReplicateNo;

	ActivationBlockedTags.AddTag(TFPSGameplayTags::State_Dead);
	ActivationBlockedTags.AddTag(TFPSGameplayTags::State_Frozen);
}

ATFPSCharacter* UTFPSGameplayAbility::GetTFPSCharacterFromActorInfo() const
{
	return CurrentActorInfo ? Cast<ATFPSCharacter>(CurrentActorInfo->AvatarActor.Get()) : nullptr;
}

UTFPSWeaponComponent* UTFPSGameplayAbility::GetWeaponComponentFromActorInfo() const
{
	const ATFPSCharacter* Character = GetTFPSCharacterFromActorInfo();
	return Character ? Character->GetWeaponComponent() : nullptr;
}

UTFPSAbilitySystemComponent* UTFPSGameplayAbility::GetTFPSAbilitySystemComponentFromActorInfo() const
{
	return CurrentActorInfo ? Cast<UTFPSAbilitySystemComponent>(CurrentActorInfo->AbilitySystemComponent.Get()) : nullptr;
}
