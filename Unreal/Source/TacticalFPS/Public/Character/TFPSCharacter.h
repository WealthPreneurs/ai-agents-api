#pragma once

#include "AbilitySystem/TFPSAbilitySet.h"
#include "AbilitySystemInterface.h"
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "GameplayTagContainer.h"

#include "TFPSCharacter.generated.h"

class UCameraComponent;
class UInputMappingContext;
class USkeletalMeshComponent;
class UTFPSAbilitySystemComponent;
class UTFPSInputConfig;
struct FGameplayEffectSpec;
struct FInputActionValue;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FTFPSCharacterDiedSignature, ATFPSCharacter*, Victim, AActor*, Killer);

/**
 * First-person character. It is the ASC's avatar; the ASC itself lives on ATFPSPlayerState.
 *
 * Meshes:
 *  - Mesh1P (arms + weapon): seen only by the owner, no shadows, only animates when rendered.
 *  - GetMesh() (full body):  hidden from the owner, seen by everyone else, always posed so server-side
 *                            hit registration traces against the same bones clients see.
 *
 * Movement is standard CharacterMovementComponent: the client predicts, the server simulates the same
 * moves and corrects on divergence. Position is never client-authoritative.
 *
 * Ability system init:
 *  - Server:          PossessedBy       -> InitializeAbilitySystem (grants the default ability set).
 *  - All clients:     OnRep_PlayerState -> InitializeAbilitySystem (actor info only, no grants).
 *  - Teardown:        UnPossessed / OnRep_PlayerState(null) / EndPlay -> UninitializeAbilitySystem.
 */
UCLASS()
class TACTICALFPS_API ATFPSCharacter : public ACharacter, public IAbilitySystemInterface
{
	GENERATED_BODY()

public:
	ATFPSCharacter(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());

	//~IAbilitySystemInterface
	virtual UAbilitySystemComponent* GetAbilitySystemComponent() const override;
	//~End IAbilitySystemInterface

	UTFPSAbilitySystemComponent* GetTFPSAbilitySystemComponent() const { return AbilitySystemComponent.Get(); }

	USkeletalMeshComponent* GetMesh1P() const { return Mesh1P; }
	UCameraComponent* GetFirstPersonCamera() const { return FirstPersonCamera; }

	UFUNCTION(BlueprintPure, Category = "TFPS|Character")
	bool IsDead() const { return bIsDead; }

	/** Server only. Game mode binds here for scoring, killfeed and respawn. */
	UPROPERTY(BlueprintAssignable, Category = "TFPS|Character")
	FTFPSCharacterDiedSignature OnDied;

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:
	//~APawn / AActor
	virtual void PossessedBy(AController* NewController) override;
	virtual void UnPossessed() override;
	virtual void OnRep_PlayerState() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	//~End APawn / AActor

	/** Cosmetic death response (VFX, audio, death camera). Runs on every machine. */
	UFUNCTION(BlueprintImplementableEvent, Category = "TFPS|Character", Meta = (DisplayName = "On Death Started"))
	void K2_OnDeathStarted();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "TFPS|Character")
	TObjectPtr<UCameraComponent> FirstPersonCamera;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "TFPS|Character")
	TObjectPtr<USkeletalMeshComponent> Mesh1P;

	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Input")
	TObjectPtr<const UTFPSInputConfig> InputConfig;

	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Input")
	TObjectPtr<const UInputMappingContext> DefaultMappingContext;

	/** Base kit granted on every spawn (sprint, ADS, attribute reset effect, ...). */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Abilities")
	TObjectPtr<const UTFPSAbilitySet> DefaultAbilitySet;

	/** Seconds a corpse stays in the world before being destroyed on the server. */
	UPROPERTY(EditDefaultsOnly, Category = "TFPS|Character", Meta = (ClampMin = 0.1))
	float CorpseLifeSpan = 10.f;

private:
	void InitializeAbilitySystem();
	void UninitializeAbilitySystem();

	void HandleOutOfHealth(AActor* DamageInstigator, AActor* DamageCauser, const FGameplayEffectSpec* DamageSpec, float DamageMagnitude);
	void HandleDeathPresentation();

	UFUNCTION()
	void OnRep_IsDead();

	void Input_Move(const FInputActionValue& Value);
	void Input_Look(const FInputActionValue& Value);
	void Input_JumpPressed();
	void Input_JumpReleased();
	void Input_CrouchPressed();
	void Input_CrouchReleased();
	void Input_AbilityPressed(FGameplayTag InputTag);
	void Input_AbilityReleased(FGameplayTag InputTag);

	/** Owned by the PlayerState, which can be destroyed first on disconnect, hence weak. */
	TWeakObjectPtr<UTFPSAbilitySystemComponent> AbilitySystemComponent;

	FTFPSAbilitySet_GrantedHandles GrantedHandles;

	FDelegateHandle OutOfHealthHandle;

	/** Replicated on the pawn itself so death visuals arrive in the same bunch as the pawn's state. */
	UPROPERTY(ReplicatedUsing = OnRep_IsDead)
	bool bIsDead = false;

	bool bDeathPresentationDone = false;
};
