#pragma once

#include "AbilitySystemComponent.h"
#include "AttributeSet.h"
#include "AbilitySystem/Attributes/TFPSHealthSet.h"
#include "CoreMinimal.h"

#include "TFPSMovementSet.generated.h"

/**
 * Movement attributes, modified by perk / equipment / status effects (e.g. Lightweight +10%, a stun -50%).
 * Read every move by UTFPSCharacterMovementComponent on both the owning client and the server, so it
 * replicates to the owner (who predicts with it) and nobody else.
 */
UCLASS()
class TACTICALFPS_API UTFPSMovementSet : public UAttributeSet
{
	GENERATED_BODY()

public:
	UTFPSMovementSet();

	TFPS_ATTRIBUTE_ACCESSORS(UTFPSMovementSet, MovementSpeedMultiplier);

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:
	virtual void PreAttributeBaseChange(const FGameplayAttribute& Attribute, float& NewValue) const override;
	virtual void PreAttributeChange(const FGameplayAttribute& Attribute, float& NewValue) override;

	UFUNCTION()
	void OnRep_MovementSpeedMultiplier(const FGameplayAttributeData& OldValue);

private:
	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_MovementSpeedMultiplier, Category = "TFPS|Movement", Meta = (AllowPrivateAccess = true))
	FGameplayAttributeData MovementSpeedMultiplier;
};
