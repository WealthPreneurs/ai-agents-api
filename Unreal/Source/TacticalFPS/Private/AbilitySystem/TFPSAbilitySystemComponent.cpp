#include "AbilitySystem/TFPSAbilitySystemComponent.h"

#include "Abilities/GameplayAbility.h"

UTFPSAbilitySystemComponent::UTFPSAbilitySystemComponent()
{
	InputPressedSpecHandles.Reserve(4);
	InputReleasedSpecHandles.Reserve(4);
}

void UTFPSAbilitySystemComponent::AbilityInputTagPressed(const FGameplayTag& InputTag)
{
	if (!InputTag.IsValid())
	{
		return;
	}

	for (const FGameplayAbilitySpec& Spec : ActivatableAbilities.Items)
	{
		if (Spec.Ability && Spec.GetDynamicSpecSourceTags().HasTagExact(InputTag))
		{
			InputPressedSpecHandles.AddUnique(Spec.Handle);
		}
	}
}

void UTFPSAbilitySystemComponent::AbilityInputTagReleased(const FGameplayTag& InputTag)
{
	if (!InputTag.IsValid())
	{
		return;
	}

	for (const FGameplayAbilitySpec& Spec : ActivatableAbilities.Items)
	{
		if (Spec.Ability && Spec.GetDynamicSpecSourceTags().HasTagExact(InputTag))
		{
			InputReleasedSpecHandles.AddUnique(Spec.Handle);
		}
	}
}

void UTFPSAbilitySystemComponent::ProcessAbilityInput(float DeltaTime, bool bGamePaused)
{
	// Presses first so a tap (press + release in the same frame) activates, then immediately releases.
	for (const FGameplayAbilitySpecHandle& Handle : InputPressedSpecHandles)
	{
		FGameplayAbilitySpec* Spec = FindAbilitySpecFromHandle(Handle);
		if (!Spec || !Spec->Ability)
		{
			continue;
		}

		Spec->InputPressed = true;

		if (Spec->IsActive())
		{
			// Already running (e.g. full-auto fire waiting on release): forward the press to the instance.
			AbilitySpecInputPressed(*Spec);
		}
		else
		{
			// Local predicted activation on the owning client; the server re-validates tags, cost and
			// cooldown in its own TryActivateAbility and rejects (rolls back) anything that fails.
			TryActivateAbility(Handle);
		}
	}

	for (const FGameplayAbilitySpecHandle& Handle : InputReleasedSpecHandles)
	{
		FGameplayAbilitySpec* Spec = FindAbilitySpecFromHandle(Handle);
		if (!Spec || !Spec->Ability)
		{
			continue;
		}

		Spec->InputPressed = false;

		if (Spec->IsActive())
		{
			AbilitySpecInputReleased(*Spec);
		}
	}

	InputPressedSpecHandles.Reset();
	InputReleasedSpecHandles.Reset();
}

void UTFPSAbilitySystemComponent::ClearAbilityInput()
{
	InputPressedSpecHandles.Reset();
	InputReleasedSpecHandles.Reset();
}

void UTFPSAbilitySystemComponent::AbilitySpecInputPressed(FGameplayAbilitySpec& Spec)
{
	Super::AbilitySpecInputPressed(Spec);

	// Abilities default to bReplicateInputDirectly = false (it is unsafe to trust). Instead, replicate the
	// press as a generic event keyed to the activation's prediction key so WaitInputPress tasks fire on
	// the server in lockstep with the client.
	if (Spec.IsActive())
	{
		const UGameplayAbility* Instance = Spec.GetPrimaryInstance();
		const FPredictionKey PredictionKey = Instance
			? Instance->GetCurrentActivationInfo().GetActivationPredictionKey()
			: FPredictionKey();

		InvokeReplicatedEvent(EAbilityGenericReplicatedEvent::InputPressed, Spec.Handle, PredictionKey);
	}
}

void UTFPSAbilitySystemComponent::AbilitySpecInputReleased(FGameplayAbilitySpec& Spec)
{
	Super::AbilitySpecInputReleased(Spec);

	if (Spec.IsActive())
	{
		const UGameplayAbility* Instance = Spec.GetPrimaryInstance();
		const FPredictionKey PredictionKey = Instance
			? Instance->GetCurrentActivationInfo().GetActivationPredictionKey()
			: FPredictionKey();

		InvokeReplicatedEvent(EAbilityGenericReplicatedEvent::InputReleased, Spec.Handle, PredictionKey);
	}
}
