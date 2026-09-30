#include "AbilitySystem/Attributes/TFPSMovementSet.h"

#include "Net/UnrealNetwork.h"

namespace TFPSMovementSet
{
	// A multiplier outside this range is a content bug, and would make prediction corrections violent.
	static constexpr float MinSpeedMultiplier = 0.1f;
	static constexpr float MaxSpeedMultiplier = 2.f;
}

UTFPSMovementSet::UTFPSMovementSet()
	: MovementSpeedMultiplier(1.f)
{
}

void UTFPSMovementSet::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	DOREPLIFETIME_CONDITION_NOTIFY(UTFPSMovementSet, MovementSpeedMultiplier, COND_OwnerOnly, REPNOTIFY_Always);
}

void UTFPSMovementSet::PreAttributeBaseChange(const FGameplayAttribute& Attribute, float& NewValue) const
{
	Super::PreAttributeBaseChange(Attribute, NewValue);

	if (Attribute == GetMovementSpeedMultiplierAttribute())
	{
		NewValue = FMath::Clamp(NewValue, TFPSMovementSet::MinSpeedMultiplier, TFPSMovementSet::MaxSpeedMultiplier);
	}
}

void UTFPSMovementSet::PreAttributeChange(const FGameplayAttribute& Attribute, float& NewValue)
{
	Super::PreAttributeChange(Attribute, NewValue);

	if (Attribute == GetMovementSpeedMultiplierAttribute())
	{
		NewValue = FMath::Clamp(NewValue, TFPSMovementSet::MinSpeedMultiplier, TFPSMovementSet::MaxSpeedMultiplier);
	}
}

void UTFPSMovementSet::OnRep_MovementSpeedMultiplier(const FGameplayAttributeData& OldValue)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UTFPSMovementSet, MovementSpeedMultiplier, OldValue);
}
