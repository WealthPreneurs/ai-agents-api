#include "Movement/TFPSCharacterMovementComponent.h"

#include "AbilitySystem/Attributes/TFPSMovementSet.h"
#include "AbilitySystemComponent.h"
#include "Character/TFPSCharacter.h"
#include "GameFramework/Character.h"
#include "Weapons/TFPSWeaponComponent.h"

// --- Saved move --------------------------------------------------------------------------------

/** Adds sprint/aim intent to the client's saved moves so the server replays them identically. */
class FSavedMove_TFPS : public FSavedMove_Character
{
public:
	using Super = FSavedMove_Character;

	virtual void Clear() override
	{
		Super::Clear();
		bSavedWantsToSprint = false;
		bSavedWantsToAim = false;
	}

	virtual uint8 GetCompressedFlags() const override
	{
		uint8 Flags = Super::GetCompressedFlags();
		if (bSavedWantsToSprint)
		{
			Flags |= FLAG_Custom_0;
		}
		if (bSavedWantsToAim)
		{
			Flags |= FLAG_Custom_1;
		}
		return Flags;
	}

	virtual bool CanCombineWith(const FSavedMovePtr& NewMove, ACharacter* InCharacter, float MaxDelta) const override
	{
		// Never merge moves across an intent change, or the server would apply the wrong speed to part of it.
		const FSavedMove_TFPS* Other = static_cast<const FSavedMove_TFPS*>(NewMove.Get());
		if (bSavedWantsToSprint != Other->bSavedWantsToSprint || bSavedWantsToAim != Other->bSavedWantsToAim)
		{
			return false;
		}
		return Super::CanCombineWith(NewMove, InCharacter, MaxDelta);
	}

	virtual void SetMoveFor(ACharacter* InCharacter, float InDeltaTime, FVector const& NewAccel, FNetworkPredictionData_Client_Character& ClientData) override
	{
		Super::SetMoveFor(InCharacter, InDeltaTime, NewAccel, ClientData);

		if (const UTFPSCharacterMovementComponent* Movement = Cast<UTFPSCharacterMovementComponent>(InCharacter->GetCharacterMovement()))
		{
			bSavedWantsToSprint = Movement->bWantsToSprint;
			bSavedWantsToAim = Movement->bWantsToAim;
		}
	}

	virtual void PrepMoveFor(ACharacter* InCharacter) override
	{
		Super::PrepMoveFor(InCharacter);

		// Replaying after a correction: restore the intent this move was made with.
		if (UTFPSCharacterMovementComponent* Movement = Cast<UTFPSCharacterMovementComponent>(InCharacter->GetCharacterMovement()))
		{
			Movement->bWantsToSprint = bSavedWantsToSprint;
			Movement->bWantsToAim = bSavedWantsToAim;
		}
	}

private:
	bool bSavedWantsToSprint = false;
	bool bSavedWantsToAim = false;
};

class FNetworkPredictionData_Client_TFPS : public FNetworkPredictionData_Client_Character
{
public:
	using Super = FNetworkPredictionData_Client_Character;

	explicit FNetworkPredictionData_Client_TFPS(const UCharacterMovementComponent& ClientMovement)
		: Super(ClientMovement)
	{
	}

	virtual FSavedMovePtr AllocateNewMove() override
	{
		return FSavedMovePtr(new FSavedMove_TFPS());
	}
};

// --- Component ---------------------------------------------------------------------------------

UTFPSCharacterMovementComponent::UTFPSCharacterMovementComponent(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
	, bWantsToSprint(false)
	, bWantsToAim(false)
{
}

FNetworkPredictionData_Client* UTFPSCharacterMovementComponent::GetPredictionData_Client() const
{
	if (!ClientPredictionData)
	{
		UTFPSCharacterMovementComponent* MutableThis = const_cast<UTFPSCharacterMovementComponent*>(this);
		MutableThis->ClientPredictionData = new FNetworkPredictionData_Client_TFPS(*this);
	}
	return ClientPredictionData;
}

void UTFPSCharacterMovementComponent::UpdateFromCompressedFlags(uint8 Flags)
{
	Super::UpdateFromCompressedFlags(Flags);

	// Server: intent arrives with each move.
	bWantsToSprint = (Flags & FSavedMove_Character::FLAG_Custom_0) != 0;
	bWantsToAim = (Flags & FSavedMove_Character::FLAG_Custom_1) != 0;
}

bool UTFPSCharacterMovementComponent::CanSprintInCurrentState() const
{
	if (!CharacterOwner || !IsMovingOnGround() || IsCrouching() || bWantsToAim)
	{
		return false;
	}

	const FVector Acceleration = GetCurrentAcceleration().GetSafeNormal2D();
	if (Acceleration.IsNearlyZero())
	{
		return false;
	}

	return FVector::DotProduct(Acceleration, CharacterOwner->GetActorForwardVector()) >= MinForwardInputForSprint;
}

bool UTFPSCharacterMovementComponent::IsSprinting() const
{
	return bWantsToSprint && CanSprintInCurrentState();
}

float UTFPSCharacterMovementComponent::GetSpeedMultiplier() const
{
	float Multiplier = 1.f;

	const ATFPSCharacter* Character = Cast<ATFPSCharacter>(CharacterOwner);
	if (!Character)
	{
		return Multiplier;
	}

	if (const UAbilitySystemComponent* ASC = Character->GetAbilitySystemComponent())
	{
		const FGameplayAttribute Attribute = UTFPSMovementSet::GetMovementSpeedMultiplierAttribute();
		if (ASC->HasAttributeSetForAttribute(Attribute))
		{
			Multiplier *= ASC->GetNumericAttribute(Attribute);
		}
	}

	if (const UTFPSWeaponComponent* Weapons = Character->GetWeaponComponent())
	{
		if (const FTFPSWeaponStats* Stats = Weapons->GetEquippedStats())
		{
			Multiplier *= Stats->MovementSpeedMultiplier;
			if (bWantsToAim)
			{
				Multiplier *= Stats->ADSMovementSpeedMultiplier;
			}
		}
	}

	if (IsSprinting())
	{
		Multiplier *= SprintSpeedMultiplier;
	}

	return Multiplier;
}

float UTFPSCharacterMovementComponent::GetMaxSpeed() const
{
	const float BaseSpeed = Super::GetMaxSpeed();

	if (MovementMode == MOVE_Walking || MovementMode == MOVE_NavWalking)
	{
		return BaseSpeed * GetSpeedMultiplier();
	}
	return BaseSpeed;
}

void UTFPSCharacterMovementComponent::OnMovementUpdated(float DeltaSeconds, const FVector& OldLocation, const FVector& OldVelocity)
{
	Super::OnMovementUpdated(DeltaSeconds, OldLocation, OldVelocity);

	// Server: publish the resolved state for simulated proxies' animation.
	if (CharacterOwner && CharacterOwner->HasAuthority())
	{
		if (ATFPSCharacter* Character = Cast<ATFPSCharacter>(CharacterOwner))
		{
			Character->SetReplicatedMovementState(IsSprinting(), bWantsToAim);
		}
	}
}
