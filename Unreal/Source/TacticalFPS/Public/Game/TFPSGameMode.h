#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameplayTagContainer.h"

#include "TFPSGameMode.generated.h"

class ATFPSCharacter;
class ATFPSGameState;

/**
 * Server-only match controller: team assignment, spawning, respawns, scoring and the phase machine.
 *
 *   Warmup ──(timer, enough players)──> InProgress ──(score limit or time)──> RoundEnd
 *     ^  └──(timer, not enough players: extend)            ^                    │
 *     │                                                     └─(more rounds)─────┤
 *   next map <──(timer)── PostGame <──────────────(match decided)───────────────┘
 *
 * Every transition goes through EnterPhase, which writes ATFPSGameState (replicated) and arms one timer.
 * No tick. Phase-gated rules:
 *   - Spawning/respawning: Warmup and InProgress only.
 *   - Scoring: InProgress only (warmup kills are free).
 *   - Damage and abilities: blocked in RoundEnd/PostGame (health set + State.Frozen).
 *
 * All tunables are Config, so a dedicated server can be reconfigured in DefaultGame.ini, and many can
 * be overridden per match via URL options: ?ScoreLimit=100?RoundDuration=300?MinPlayers=4?Warmup=20
 */
UCLASS(Config = Game)
class TACTICALFPS_API ATFPSGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ATFPSGameMode(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~AGameModeBase
	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual void InitGameState() override;
	virtual void StartPlay() override;
	virtual void HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer) override;
	virtual bool PlayerCanRestart_Implementation(APlayerController* Player) override;
	virtual bool ShouldSpawnAtStartSpot(AController* Player) override;
	virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
	virtual void FinishRestartPlayer(AController* NewPlayer, const FRotator& StartRotation) override;
	//~End AGameModeBase

	/**
	 * Server. Progression level used to validate loadout unlocks. Override to read the player's level from
	 * your backend (keyed by UniqueNetId, fetched at login). Never derive it from anything the client sends,
	 * such as URL options.
	 */
	virtual int32 GetUnlockLevel(const APlayerState* PlayerState) const { return DefaultUnlockLevel; }

protected:
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 2, ClampMax = 8))
	int32 NumTeams = 2;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 1))
	int32 MinPlayersToStart = 2;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 1, Units = "s"))
	float WarmupDuration = 30.f;

	/** 0 = untimed round (ends on score limit only). */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 0, Units = "s"))
	float RoundDuration = 600.f;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 1, Units = "s"))
	float RoundEndDuration = 8.f;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 1, Units = "s"))
	float PostGameDuration = 15.f;

	/** Team kills needed to win a round. */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 1))
	int32 ScoreLimit = 75;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 1))
	int32 RoundsToWin = 1;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 1))
	int32 MaxRounds = 1;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match", Meta = (ClampMin = 0, Units = "s"))
	float RespawnDelay = 3.f;

	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match")
	bool bFriendlyFire = false;

	/** Map package paths, e.g. /Game/Maps/Shipment. Empty = replay the current map. */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Match")
	TArray<FString> MapRotation;

	/** Unlock level everyone gets until a backend provides real progression. High = everything unlocked. */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Loadout")
	int32 DefaultUnlockLevel = 1000;

	/** Spawn points closer than this to any living player are skipped (spawn blocking / telefrags). */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Spawning", Meta = (Units = "cm"))
	float SpawnBlockRadius = 150.f;

	/** Enemy distance beyond which a spawn is considered fully safe; further distance adds no score. */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Spawning", Meta = (Units = "cm"))
	float SpawnSafeDistance = 5000.f;

	/** Random score added per spawn so equally safe spawns rotate. */
	UPROPERTY(Config, EditDefaultsOnly, Category = "TFPS|Spawning", Meta = (Units = "cm"))
	float SpawnRandomness = 750.f;

private:
	ATFPSGameState* GetTFPSGameState() const;

	/** Server: load every registered loadout item up front so validation never hitches on disk IO. */
	void PreloadLoadoutItems();

	void EnterPhase(FGameplayTag Phase, float Duration);
	void OnPhaseTimerExpired();

	void StartWarmup();
	void StartRound();
	void EndRound(uint8 WinningTeam);
	void StartPostGame();
	void TravelToNextMap();

	bool CanPlayersSpawn() const;
	bool IsMatchDecided() const;
	uint8 DetermineRoundWinner() const;
	uint8 DetermineMatchWinner() const;
	uint8 PickTeamForNewPlayer() const;

	void RestartAllPlayers();
	void FreezeAllPlayers();
	void RespawnPlayer(TWeakObjectPtr<AController> Controller);

	UFUNCTION()
	void OnCharacterDied(ATFPSCharacter* Victim, AActor* Killer);

	FTimerHandle PhaseTimerHandle;

	/** Current index into MapRotation, carried across travel in the URL (?RotationIndex=N). */
	int32 MapRotationIndex = 0;
};
