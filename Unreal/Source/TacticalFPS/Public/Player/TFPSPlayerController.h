#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"

#include "TFPSPlayerController.generated.h"

class ATFPSPlayerState;
class UTFPSAbilitySystemComponent;

/**
 * Drives the ASC's per-frame input processing. PostProcessInput only runs where input is processed
 * (the owning client, or the listen-server host for its own player), so the server never runs this
 * path for remote players: it only sees the resulting predicted activations and replicated events.
 */
UCLASS()
class TACTICALFPS_API ATFPSPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "TFPS|PlayerController")
	ATFPSPlayerState* GetTFPSPlayerState() const;

	UFUNCTION(BlueprintCallable, Category = "TFPS|PlayerController")
	UTFPSAbilitySystemComponent* GetTFPSAbilitySystemComponent() const;

protected:
	//~APlayerController
	virtual void PostProcessInput(const float DeltaTime, const bool bGamePaused) override;
	virtual void OnUnPossess() override;
	//~End APlayerController
};
