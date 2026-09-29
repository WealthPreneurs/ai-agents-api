#pragma once

#include "AbilitySystemInterface.h"
#include "CoreMinimal.h"
#include "GameFramework/PlayerState.h"

#include "TFPSPlayerState.generated.h"

class UAbilitySystemComponent;
class UTFPSAbilitySystemComponent;
class UTFPSHealthSet;

/**
 * Owns the ASC and attribute sets so loadout-granted abilities, perk effects and stats persist across
 * pawn death/respawn and seamless travel. The pawn is only the ASC's avatar.
 *
 * ASC replication mode is Mixed: gameplay effects replicate in full to the owning client only (for UI
 * and prediction), while simulated proxies receive just tags and gameplay cues. That is the main
 * bandwidth saving for 64+ player lobbies versus Full mode.
 */
UCLASS()
class TACTICALFPS_API ATFPSPlayerState : public APlayerState, public IAbilitySystemInterface
{
	GENERATED_BODY()

public:
	ATFPSPlayerState(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~IAbilitySystemInterface
	virtual UAbilitySystemComponent* GetAbilitySystemComponent() const override;
	//~End IAbilitySystemInterface

	UFUNCTION(BlueprintCallable, Category = "TFPS|PlayerState")
	UTFPSAbilitySystemComponent* GetTFPSAbilitySystemComponent() const { return AbilitySystemComponent; }

	const UTFPSHealthSet* GetHealthSet() const { return HealthSet; }

private:
	UPROPERTY(VisibleAnywhere, Category = "TFPS|PlayerState")
	TObjectPtr<UTFPSAbilitySystemComponent> AbilitySystemComponent;

	// Default subobject of the ASC's owner, so the ASC discovers and registers it automatically.
	UPROPERTY()
	TObjectPtr<UTFPSHealthSet> HealthSet;
};
