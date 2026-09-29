#pragma once

#include "AbilitySystem/Abilities/TFPSGameplayAbility.h"
#include "CoreMinimal.h"
#include "GameplayTagContainer.h"

#include "TFPSGameplayAbility_Fire.generated.h"

class UTFPSWeaponDefinition;
struct FTFPSShotHit;
struct FTFPSShotTargetData;

/**
 * Hitscan fire for semi, burst and full-auto weapons.
 *
 * One activation covers one trigger pull, so a full-auto burst held for 2 seconds is one activation
 * and N shots.
 *
 * Owning client (predicted):
 *   Activate -> FireShot now, then on a timer at the weapon's fire interval while input is held.
 *   FireShot -> open a new dependent prediction window, trace locally, predict ammo, play the fire cue
 *               locally, then send FTFPSShotTargetData to the server as replicated target data.
 *
 * Server (remote shooter):
 *   Activate -> bind to the ability's target-data delegate and wait. The server never fires on its own
 *               timer; it only validates and applies what the client claims, in order (reliable RPCs).
 *   Per shot -> fire-rate token bucket, shot sanity (origin, age, range, pellet count), ammo, then per
 *               hit: target alive/in range/near its server position, bone exists, no static geometry in
 *               the way. Damage is computed here from the weapon definition; the client never sends it.
 *               The fire cue is executed under the client's prediction key, so the shooter doesn't get
 *               it twice.
 *
 * Listen-server host: runs the client path and calls the server processing directly (no RPC).
 *
 * TODO(lag-comp): ValidateHit's position check is a plausibility bound. The rewind subsystem will
 * replace it with a trace against the target's hitboxes rewound to Shot.ClientServerTime.
 */
UCLASS()
class TACTICALFPS_API UTFPSGameplayAbility_Fire : public UTFPSGameplayAbility
{
	GENERATED_BODY()

public:
	UTFPSGameplayAbility_Fire(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~UGameplayAbility
	virtual bool CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const override;
	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData) override;
	virtual void EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
		const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled) override;
	//~End UGameplayAbility

protected:
	/** Local-only feedback (recoil kick, camera shake, 1P fire montage). Owning client / host only. */
	UFUNCTION(BlueprintImplementableEvent, Category = "TFPS|Fire", Meta = (DisplayName = "On Local Shot Fired"))
	void K2_OnLocalShotFired();

	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Fire", Meta = (Categories = "GameplayCue"))
	FGameplayTag FireCueTag;

	/** Max distance between the claimed trace origin and the server's view location for the shooter. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Fire|Validation", Meta = (Units = "cm"))
	float MaxOriginError = 200.f;

	/** Oldest shot (by claimed server time) the server will honour. Caps how far high-ping shooters are favoured. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Fire|Validation", Meta = (Units = "s"))
	float MaxLagCompensationTime = 0.35f;

	/** How far a shot's claimed time may be ahead of the server clock (client time-sync error). */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Fire|Validation", Meta = (Units = "s"))
	float MaxClockSkew = 0.1f;

	/** Extra room around the target's collision cylinder for limbs and animation, before velocity slack. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Fire|Validation", Meta = (Units = "cm"))
	float MaxTargetPositionError = 100.f;

private:
	void FireShot();
	void OnFireTimer();
	void ExecuteFireCue(const FTFPSShotTargetData& Shot) const;

	void OnServerTargetDataReceived(const FGameplayAbilityTargetDataHandle& Data, FGameplayTag ApplicationTag);
	void ProcessShotOnServer(const FTFPSShotTargetData& Shot);
	bool ValidateShot(const FTFPSShotTargetData& Shot, const UTFPSWeaponDefinition& Weapon) const;
	bool ValidateHit(const FTFPSShotTargetData& Shot, const FTFPSShotHit& Hit, const UTFPSWeaponDefinition& Weapon, FName& OutBone) const;
	void ApplyDamage(AActor* Target, float Damage, const UTFPSWeaponDefinition& Weapon);

	double GetServerWorldTime() const;

	UPROPERTY(Transient)
	TObjectPtr<const UTFPSWeaponDefinition> ActiveWeapon;

	FTimerHandle FireTimerHandle;
	FDelegateHandle TargetDataDelegateHandle;
	int32 ShotsFiredThisActivation = 0;
};
