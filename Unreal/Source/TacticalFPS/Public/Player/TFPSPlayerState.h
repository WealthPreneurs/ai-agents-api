#pragma once

#include "AbilitySystemInterface.h"
#include "CoreMinimal.h"
#include "GameFramework/PlayerState.h"
#include "Teams/TFPSTeamAgentInterface.h"

#include "TFPSPlayerState.generated.h"

class UAbilitySystemComponent;
class UTFPSAbilitySystemComponent;
class UTFPSHealthSet;
class UTFPSLoadoutComponent;

/**
 * Owns the ASC and attribute sets so loadout-granted abilities, perk effects and stats persist across
 * pawn death/respawn and seamless travel. The pawn is only the ASC's avatar.
 *
 * ASC replication mode is Mixed: gameplay effects replicate in full to the owning client only (for UI
 * and prediction), while simulated proxies receive just tags and gameplay cues. That is the main
 * bandwidth saving for 64+ player lobbies versus Full mode.
 *
 * Also the source of truth for team and scoreboard stats (replicated to everyone for the scoreboard).
 */
UCLASS()
class TACTICALFPS_API ATFPSPlayerState : public APlayerState, public IAbilitySystemInterface, public ITFPSTeamAgentInterface
{
	GENERATED_BODY()

public:
	ATFPSPlayerState(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	//~IAbilitySystemInterface
	virtual UAbilitySystemComponent* GetAbilitySystemComponent() const override;
	//~End IAbilitySystemInterface

	//~ITFPSTeamAgentInterface
	virtual uint8 GetTFPSTeamId() const override { return TeamId; }
	//~End ITFPSTeamAgentInterface

	UFUNCTION(BlueprintCallable, Category = "TFPS|PlayerState")
	UTFPSAbilitySystemComponent* GetTFPSAbilitySystemComponent() const { return AbilitySystemComponent; }

	const UTFPSHealthSet* GetHealthSet() const { return HealthSet; }

	UFUNCTION(BlueprintPure, Category = "TFPS|PlayerState")
	UTFPSLoadoutComponent* GetLoadoutComponent() const { return LoadoutComponent; }

	UFUNCTION(BlueprintPure, Category = "TFPS|PlayerState")
	int32 GetTeamIdAsInt() const { return TeamId == NoTeam ? -1 : TeamId; }

	UFUNCTION(BlueprintPure, Category = "TFPS|PlayerState")
	int32 GetKills() const { return Kills; }

	UFUNCTION(BlueprintPure, Category = "TFPS|PlayerState")
	int32 GetDeaths() const { return Deaths; }

	// Server only.
	void SetTeamId(uint8 NewTeamId);
	void AddKill();
	void AddDeath();
	void ResetMatchStats();

protected:
	//~APlayerState
	virtual void CopyProperties(APlayerState* PlayerState) override;
	virtual void OverrideWith(APlayerState* PlayerState) override;
	//~End APlayerState

private:
	UPROPERTY(VisibleAnywhere, Category = "TFPS|PlayerState")
	TObjectPtr<UTFPSAbilitySystemComponent> AbilitySystemComponent;

	// Default subobject of the ASC's owner, so the ASC discovers and registers it automatically.
	UPROPERTY()
	TObjectPtr<UTFPSHealthSet> HealthSet;

	UPROPERTY(VisibleAnywhere, Category = "TFPS|PlayerState")
	TObjectPtr<UTFPSLoadoutComponent> LoadoutComponent;

	UPROPERTY(Replicated)
	uint8 TeamId = NoTeam;

	UPROPERTY(Replicated)
	int32 Kills = 0;

	UPROPERTY(Replicated)
	int32 Deaths = 0;
};
