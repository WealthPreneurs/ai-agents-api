#include "AbilitySystem/Abilities/TFPSGameplayAbility_Reload.h"

#include "AbilitySystemComponent.h"
#include "Character/TFPSCharacter.h"
#include "Engine/World.h"
#include "TFPSGameplayTags.h"
#include "TimerManager.h"
#include "Weapons/TFPSWeaponComponent.h"

UTFPSGameplayAbility_Reload::UTFPSGameplayAbility_Reload(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	FGameplayTagContainer AssetTags;
	AssetTags.AddTag(TFPSGameplayTags::Ability_Weapon_Reload);
	SetAssetTags(AssetTags);

	ActivationOwnedTags.AddTag(TFPSGameplayTags::State_Reloading);
}

bool UTFPSGameplayAbility_Reload::CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const
{
	if (!Super::CanActivateAbility(Handle, ActorInfo, SourceTags, TargetTags, OptionalRelevantTags))
	{
		return false;
	}

	const ATFPSCharacter* Character = ActorInfo ? Cast<ATFPSCharacter>(ActorInfo->AvatarActor.Get()) : nullptr;
	const UTFPSWeaponComponent* Weapons = Character ? Character->GetWeaponComponent() : nullptr;
	return Weapons && Weapons->CanReload();
}

void UTFPSGameplayAbility_Reload::ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData)
{
	UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	const FTFPSWeaponStats* Stats = Weapons ? Weapons->GetEquippedStats() : nullptr;
	if (!Stats || !CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	ReloadDuration = Stats->ReloadTime;
	bServerReloadDone = false;

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	FPredictionKey ActivationKey = ActivationInfo.GetActivationPredictionKey();

	if (ActorInfo->IsNetAuthority() && !ActorInfo->IsLocallyControlled())
	{
		// Server copy of a remote player's reload: wait for the client's "finished" signal.
		ServerActivationTime = GetWorld()->GetTimeSeconds();
		SignalDelegateHandle = ASC->AbilityReplicatedEventDelegate(EAbilityGenericReplicatedEvent::GenericSignalFromClient, Handle, ActivationKey)
			.AddUObject(this, &ThisClass::OnServerReloadSignal);
		ASC->CallReplicatedEventDelegateIfSet(EAbilityGenericReplicatedEvent::GenericSignalFromClient, Handle, ActivationKey);
		return;
	}

	if (!ActorInfo->IsLocallyControlled())
	{
		return;
	}

	if (!ActorInfo->IsNetAuthority())
	{
		// If the server rejects the activation, undo anything we predicted.
		ActivationKey.NewRejectedDelegate().BindUObject(Weapons, &UTFPSWeaponComponent::ClearPredictedReload);
	}

	K2_OnReloadStarted(ReloadDuration);

	if (ReloadDuration <= 0.f)
	{
		OnLocalReloadFinished();
		return;
	}
	GetWorld()->GetTimerManager().SetTimer(ReloadTimerHandle, this, &ThisClass::OnLocalReloadFinished, ReloadDuration, false);
}

void UTFPSGameplayAbility_Reload::OnLocalReloadFinished()
{
	UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	UAbilitySystemComponent* ASC = CurrentActorInfo ? CurrentActorInfo->AbilitySystemComponent.Get() : nullptr;
	if (!Weapons || !ASC || !IsActive())
	{
		return;
	}

	if (CurrentActorInfo->IsNetAuthority())
	{
		// Listen-server host: authoritative immediately.
		Weapons->ServerReload();
	}
	else
	{
		Weapons->PredictReload();

		// Reliable and ordered with the ASC's other RPCs: the server sees it before this ability's end.
		FScopedPredictionWindow ScopedPrediction(ASC, true);
		ASC->ServerSetReplicatedEvent(EAbilityGenericReplicatedEvent::GenericSignalFromClient, CurrentSpecHandle,
			CurrentActivationInfo.GetActivationPredictionKey(), ASC->ScopedPredictionKey);
	}

	K2_EndAbility();
}

void UTFPSGameplayAbility_Reload::OnServerReloadSignal()
{
	UAbilitySystemComponent* ASC = CurrentActorInfo ? CurrentActorInfo->AbilitySystemComponent.Get() : nullptr;
	if (!ASC)
	{
		return;
	}

	ASC->ConsumeGenericReplicatedEvent(EAbilityGenericReplicatedEvent::GenericSignalFromClient, CurrentSpecHandle,
		CurrentActivationInfo.GetActivationPredictionKey());

	const double Elapsed = GetWorld()->GetTimeSeconds() - ServerActivationTime;
	const double Required = ReloadDuration * ReloadTimeTolerance;

	if (Elapsed >= Required)
	{
		CompleteServerReload();
	}
	else
	{
		// Too early for an honest client: finish on the server's schedule instead. If the client also ends
		// the ability before then, EndAbility clears this timer and the reload never happens.
		GetWorld()->GetTimerManager().SetTimer(ReloadTimerHandle, this, &ThisClass::CompleteServerReload, static_cast<float>(Required - Elapsed), false);
	}
}

void UTFPSGameplayAbility_Reload::CompleteServerReload()
{
	if (bServerReloadDone || !IsActive())
	{
		return;
	}
	bServerReloadDone = true;

	if (UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo())
	{
		Weapons->ServerReload();
	}
}

void UTFPSGameplayAbility_Reload::EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled)
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(ReloadTimerHandle);
	}

	if (SignalDelegateHandle.IsValid())
	{
		if (UAbilitySystemComponent* ASC = ActorInfo ? ActorInfo->AbilitySystemComponent.Get() : nullptr)
		{
			ASC->AbilityReplicatedEventDelegate(EAbilityGenericReplicatedEvent::GenericSignalFromClient, Handle,
				ActivationInfo.GetActivationPredictionKey()).Remove(SignalDelegateHandle);
		}
		SignalDelegateHandle.Reset();
	}

	Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}
