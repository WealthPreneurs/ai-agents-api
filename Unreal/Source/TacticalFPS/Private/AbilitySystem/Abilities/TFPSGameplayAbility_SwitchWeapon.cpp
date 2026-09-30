#include "AbilitySystem/Abilities/TFPSGameplayAbility_SwitchWeapon.h"

#include "Character/TFPSCharacter.h"
#include "Engine/World.h"
#include "TFPSGameplayTags.h"
#include "TimerManager.h"
#include "Weapons/TFPSWeaponComponent.h"

UTFPSGameplayAbility_SwitchWeapon::UTFPSGameplayAbility_SwitchWeapon(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	FGameplayTagContainer AssetTags;
	AssetTags.AddTag(TFPSGameplayTags::Ability_Weapon_Switch);
	SetAssetTags(AssetTags);

	ActivationOwnedTags.AddTag(TFPSGameplayTags::State_SwitchingWeapon);

	CancelAbilitiesWithTag.AddTag(TFPSGameplayTags::Ability_Weapon_Fire);
	CancelAbilitiesWithTag.AddTag(TFPSGameplayTags::Ability_Weapon_Reload);
	CancelAbilitiesWithTag.AddTag(TFPSGameplayTags::Ability_Weapon_ADS);
}

bool UTFPSGameplayAbility_SwitchWeapon::CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const
{
	if (!Super::CanActivateAbility(Handle, ActorInfo, SourceTags, TargetTags, OptionalRelevantTags))
	{
		return false;
	}

	const ATFPSCharacter* Character = ActorInfo ? Cast<ATFPSCharacter>(ActorInfo->AvatarActor.Get()) : nullptr;
	const UTFPSWeaponComponent* Weapons = Character ? Character->GetWeaponComponent() : nullptr;
	return Weapons && Weapons->GetNumSlots() > 1;
}

void UTFPSGameplayAbility_SwitchWeapon::ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData)
{
	UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	if (!Weapons || !CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	// Both sides compute the target from their own view of the active slot; activations are processed
	// in order on the server, so they agree unless a prediction was rejected (then the client rolls back).
	const int32 TargetSlot = (Weapons->GetActiveSlot() + 1) % Weapons->GetNumSlots();

	if (ActorInfo->IsNetAuthority())
	{
		Weapons->ServerSetActiveSlot(TargetSlot);
	}
	else
	{
		Weapons->PredictActiveSlot(TargetSlot);
		ActivationInfo.GetActivationPredictionKey().NewRejectedDelegate().BindUObject(Weapons, &UTFPSWeaponComponent::ClearPredictedActiveSlot);
	}

	// Only the owner times the swap; the server ends when the client does. Ending early client-side gains
	// nothing because the weapon component refuses shots until its own equip time has elapsed.
	if (!ActorInfo->IsLocallyControlled())
	{
		return;
	}

	const FTFPSWeaponStats* Stats = Weapons->GetEquippedStats();
	const float EquipTime = Stats ? Stats->EquipTime : 0.f;
	if (EquipTime <= 0.f)
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
		return;
	}

	GetWorld()->GetTimerManager().SetTimer(EquipTimerHandle, this, &ThisClass::K2_EndAbility, EquipTime, false);
}

void UTFPSGameplayAbility_SwitchWeapon::EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled)
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(EquipTimerHandle);
	}

	Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}
