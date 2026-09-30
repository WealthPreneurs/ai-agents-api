#include "AbilitySystem/Abilities/TFPSWeaponGameplayAbility.h"

#include "AbilitySystemComponent.h"
#include "Character/TFPSCharacter.h"
#include "TFPSGameplayTags.h"
#include "Weapons/TFPSWeaponComponent.h"
#include "Weapons/TFPSWeaponDefinition.h"

UTFPSWeaponGameplayAbility::UTFPSWeaponGameplayAbility(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	ActivationBlockedTags.AddTag(TFPSGameplayTags::State_SwitchingWeapon);
}

bool UTFPSWeaponGameplayAbility::CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const
{
	if (!Super::CanActivateAbility(Handle, ActorInfo, SourceTags, TargetTags, OptionalRelevantTags))
	{
		return false;
	}

	const UAbilitySystemComponent* ASC = ActorInfo ? ActorInfo->AbilitySystemComponent.Get() : nullptr;
	const FGameplayAbilitySpec* Spec = ASC ? ASC->FindAbilitySpecFromHandle(Handle) : nullptr;
	const ATFPSCharacter* Character = ActorInfo ? Cast<ATFPSCharacter>(ActorInfo->AvatarActor.Get()) : nullptr;
	const UTFPSWeaponComponent* Weapons = Character ? Character->GetWeaponComponent() : nullptr;

	return Spec && Weapons && Weapons->GetEquippedWeapon() && Spec->SourceObject.Get() == Weapons->GetEquippedWeapon();
}

const UTFPSWeaponDefinition* UTFPSWeaponGameplayAbility::GetSourceWeapon() const
{
	const FGameplayAbilitySpec* Spec = GetCurrentAbilitySpec();
	return Spec ? Cast<UTFPSWeaponDefinition>(Spec->SourceObject.Get()) : nullptr;
}
