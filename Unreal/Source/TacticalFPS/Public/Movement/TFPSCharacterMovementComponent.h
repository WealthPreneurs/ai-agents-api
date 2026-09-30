#pragma once

#include "CoreMinimal.h"
#include "GameFramework/CharacterMovementComponent.h"

#include "TFPSCharacterMovementComponent.generated.h"

/**
 * Adds predicted sprint and aim-down-sights movement.
 *
 * The owning client sets WantsToSprint / WantsToAim (from the Sprint and ADS abilities). Those intents
 * travel with every saved move as compressed flags (FLAG_Custom_0 / FLAG_Custom_1), so the server
 * replays each move with the same intent and the same speed. No corrections, no extra RPCs.
 *
 * Intent is not permission: IsSprinting() also requires being on the ground, uncrouched, not aiming and
 * accelerating mostly forward, evaluated identically on both sides. A client forcing the sprint flag
 * gets nothing it couldn't get legitimately.
 *
 * Max speed = base (walk/crouch) x MovementSet.MovementSpeedMultiplier x held-weapon multiplier
 *             x (ADS multiplier while aiming) x (SprintSpeedMultiplier while sprinting).
 * All inputs exist on both the owning client and the server (attributes and weapon stats replicate to
 * the owner), so prediction matches. Simulated proxies don't simulate speed; they read the replicated
 * animation state on ATFPSCharacter.
 */
UCLASS()
class TACTICALFPS_API UTFPSCharacterMovementComponent : public UCharacterMovementComponent
{
	GENERATED_BODY()

	friend class FSavedMove_TFPS;

public:
	UTFPSCharacterMovementComponent(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	/** Owning client. */
	void SetWantsToSprint(bool bWants) { bWantsToSprint = bWants; }
	void SetWantsToAim(bool bWants) { bWantsToAim = bWants; }

	bool WantsToSprint() const { return bWantsToSprint; }
	bool WantsToAim() const { return bWantsToAim; }

	/** Sprint intent AND currently allowed to sprint. */
	UFUNCTION(BlueprintPure, Category = "TFPS|Movement")
	bool IsSprinting() const;

	//~UCharacterMovementComponent
	virtual float GetMaxSpeed() const override;
	virtual FNetworkPredictionData_Client* GetPredictionData_Client() const override;
	//~End UCharacterMovementComponent

protected:
	//~UCharacterMovementComponent
	virtual void UpdateFromCompressedFlags(uint8 Flags) override;
	virtual void OnMovementUpdated(float DeltaSeconds, const FVector& OldLocation, const FVector& OldVelocity) override;
	//~End UCharacterMovementComponent

	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Movement", Meta = (ClampMin = 1))
	float SprintSpeedMultiplier = 1.5f;

	/** Cosine of the widest angle between facing and acceleration that still counts as sprinting (0.5 = 60 deg). */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Movement", Meta = (ClampMin = 0, ClampMax = 1))
	float MinForwardInputForSprint = 0.5f;

private:
	bool CanSprintInCurrentState() const;
	float GetSpeedMultiplier() const;

	uint8 bWantsToSprint : 1;
	uint8 bWantsToAim : 1;
};
