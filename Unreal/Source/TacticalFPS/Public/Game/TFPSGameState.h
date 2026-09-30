#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "GameplayTagContainer.h"

#include "TFPSGameState.generated.h"

class APlayerState;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FTFPSMatchPhaseChangedSignature, FGameplayTag, NewPhase);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FTFPSScoresChangedSignature);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FTFPSKillFeedSignature, APlayerState*, Killer, APlayerState*, Victim);

/**
 * Replicated, read-only view of the match for every client: phase (a Match.Phase.* tag), its end time,
 * round number, team scores and the winner. All writes come from ATFPSGameMode on the server.
 *
 * Always relevant and small. Every property is push-model and changes rarely, so it costs almost
 * nothing between events. Phase changes force a net update so countdowns start in sync.
 *
 * Enable "Fast Replication" for gameplay tags in project settings, so MatchPhase replicates as a
 * compact index instead of a name.
 */
UCLASS()
class TACTICALFPS_API ATFPSGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	ATFPSGameState(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	// --- Queries (any machine) ------------------------------------------------------------------

	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	FGameplayTag GetMatchPhase() const { return MatchPhase; }

	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	bool IsMatchPhase(FGameplayTag Phase) const { return MatchPhase.MatchesTagExact(Phase); }

	/** Seconds left in the current phase, in server time; 0 for untimed phases. */
	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	float GetPhaseTimeRemaining() const;

	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	int32 GetTeamScore(int32 TeamId) const { return TeamScores.IsValidIndex(TeamId) ? TeamScores[TeamId] : 0; }

	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	int32 GetTeamRoundWins(int32 TeamId) const { return TeamRoundWins.IsValidIndex(TeamId) ? TeamRoundWins[TeamId] : 0; }

	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	int32 GetNumTeams() const { return TeamScores.Num(); }

	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	int32 GetRoundNumber() const { return RoundNumber; }

	/** Winner of the last finished round, or of the match during PostGame. -1 for a draw / none. */
	UFUNCTION(BlueprintPure, Category = "TFPS|Match")
	int32 GetWinningTeam() const { return WinningTeam == 255 ? -1 : WinningTeam; }

	bool IsFriendlyFireEnabled() const { return bFriendlyFire; }

	/** True in phases where damage and actions are allowed. */
	bool IsGameplayActive() const;

	// --- Server (ATFPSGameMode only) ------------------------------------------------------------

	void InitTeams(int32 NumTeams, bool bInFriendlyFire);
	void SetMatchPhase(FGameplayTag NewPhase, float Duration);
	void SetRoundNumber(int32 NewRoundNumber);
	void AddTeamScore(uint8 TeamId, int32 Delta);
	void ResetTeamScores();
	void ResetTeamRoundWins();
	void AddTeamRoundWin(uint8 TeamId);
	void SetWinningTeam(uint8 TeamId);

	/** Cosmetic kill feed. Unreliable: a dropped entry is acceptable, scores are replicated separately. */
	UFUNCTION(NetMulticast, Unreliable)
	void MulticastKillFeed(APlayerState* Killer, APlayerState* Victim);

	UPROPERTY(BlueprintAssignable, Category = "TFPS|Match")
	FTFPSMatchPhaseChangedSignature OnMatchPhaseChanged;

	UPROPERTY(BlueprintAssignable, Category = "TFPS|Match")
	FTFPSScoresChangedSignature OnScoresChanged;

	UPROPERTY(BlueprintAssignable, Category = "TFPS|Match")
	FTFPSKillFeedSignature OnKillFeed;

private:
	UFUNCTION()
	void OnRep_MatchPhase();

	UFUNCTION()
	void OnRep_Scores();

	UPROPERTY(ReplicatedUsing = OnRep_MatchPhase)
	FGameplayTag MatchPhase;

	/** Server world time the phase ends; 0 if untimed. Clients compare against GetServerWorldTimeSeconds. */
	UPROPERTY(Replicated)
	double PhaseEndServerTime = 0.0;

	UPROPERTY(Replicated)
	int32 RoundNumber = 0;

	UPROPERTY(ReplicatedUsing = OnRep_Scores)
	TArray<int32> TeamScores;

	UPROPERTY(ReplicatedUsing = OnRep_Scores)
	TArray<int32> TeamRoundWins;

	UPROPERTY(ReplicatedUsing = OnRep_Scores)
	uint8 WinningTeam = 255;

	UPROPERTY(Replicated)
	bool bFriendlyFire = false;
};
