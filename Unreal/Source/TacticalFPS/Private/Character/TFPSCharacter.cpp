#include "Character/TFPSCharacter.h"

#include "AbilitySystem/Attributes/TFPSHealthSet.h"
#include "AbilitySystem/TFPSAbilitySystemComponent.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/LocalPlayer.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameplayEffect.h"
#include "Input/TFPSInputConfig.h"
#include "LagCompensation/TFPSLagCompensationSubsystem.h"
#include "InputActionValue.h"
#include "Net/Core/PushModel/PushModel.h"
#include "Net/UnrealNetwork.h"
#include "Player/TFPSPlayerState.h"
#include "TFPSCollisionChannels.h"
#include "TFPSGameplayTags.h"
#include "Weapons/TFPSWeaponComponent.h"

ATFPSCharacter::ATFPSCharacter(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	// Nothing to do per frame here; movement and meshes tick themselves.
	PrimaryActorTick.bCanEverTick = false;

	// 200 m: past typical sniper engagement ranges on 6v6 maps. The Replication Graph's spatial grid
	// will use this as the relevancy radius once it is added.
	SetNetCullDistanceSquared(FMath::Square(20000.f));

	GetCapsuleComponent()->InitCapsuleSize(35.f, 90.f);
	// Shots resolve against the mesh's physics asset (per-bone hit zones), never the movement capsule.
	GetCapsuleComponent()->SetCollisionResponseToChannel(TFPS_TraceChannel_Weapon, ECR_Ignore);

	BaseEyeHeight = 64.f;

	FirstPersonCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FirstPersonCamera"));
	FirstPersonCamera->SetupAttachment(GetCapsuleComponent());
	FirstPersonCamera->SetRelativeLocation(FVector(0.f, 0.f, BaseEyeHeight));
	FirstPersonCamera->bUsePawnControlRotation = true;

	Mesh1P = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh1P"));
	Mesh1P->SetupAttachment(FirstPersonCamera);
	Mesh1P->SetOnlyOwnerSee(true);
	Mesh1P->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh1P->CastShadow = false;
	Mesh1P->bCastDynamicShadow = false;
	Mesh1P->bReceivesDecals = false;
	// Never rendered on a dedicated server or for other players, so this skips its animation entirely there.
	Mesh1P->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;

	USkeletalMeshComponent* Mesh3P = GetMesh();
	Mesh3P->SetOwnerNoSee(true);
	Mesh3P->bCastHiddenShadow = true; // Owner still sees their own body's shadow.
	// A dedicated server renders nothing, so anything weaker would leave the server's bones frozen and
	// hit registration would disagree with what clients see. This is the most expensive per-character
	// setting on the server; the lag-compensation pass will revisit it (hitbox capsules + URO).
	Mesh3P->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
	Mesh3P->SetCollisionResponseToChannel(TFPS_TraceChannel_Weapon, ECR_Block);

	WeaponComponent = CreateDefaultSubobject<UTFPSWeaponComponent>(TEXT("WeaponComponent"));

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->NavAgentProps.bCanCrouch = true;
	Movement->bOrientRotationToMovement = false;
	bUseControllerRotationYaw = true;
	bUseControllerRotationPitch = false;
	bUseControllerRotationRoll = false;
}

UAbilitySystemComponent* ATFPSCharacter::GetAbilitySystemComponent() const
{
	return AbilitySystemComponent.Get();
}

void ATFPSCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	// Push model: the property is only compared when marked dirty, instead of every replication pass.
	FDoRepLifetimeParams Params;
	Params.bIsPushBased = true;
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSCharacter, bIsDead, Params);
}

void ATFPSCharacter::BeginPlay()
{
	Super::BeginPlay();

	// Hitboxes come from the server's own body mesh and physics asset, never from client cosmetics,
	// so every character skin must share the default skeleton and physics asset.
	if (HasAuthority())
	{
		if (UTFPSLagCompensationSubsystem* LagComp = GetWorld()->GetSubsystem<UTFPSLagCompensationSubsystem>())
		{
			LagComp->RegisterTarget(this, GetMesh());
		}
	}
}

void ATFPSCharacter::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);

	// Server (and listen-server host).
	InitializeAbilitySystem();
}

void ATFPSCharacter::UnPossessed()
{
	UninitializeAbilitySystem();

	Super::UnPossessed();
}

void ATFPSCharacter::OnRep_PlayerState()
{
	Super::OnRep_PlayerState();

	// Clients: fires for the owning client and for simulated proxies, so gameplay cues and tag
	// callbacks work on everyone's copy of this pawn.
	if (GetPlayerState())
	{
		InitializeAbilitySystem();
	}
	else
	{
		UninitializeAbilitySystem();
	}
}

void ATFPSCharacter::NotifyControllerChanged()
{
	Super::NotifyControllerChanged();

	// First-person weapon visuals depend on local control, which a client may learn after the weapon replicates.
	WeaponComponent->RefreshCosmetics();
}

void ATFPSCharacter::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	UninitializeAbilitySystem();

	if (UTFPSLagCompensationSubsystem* LagComp = GetWorld()->GetSubsystem<UTFPSLagCompensationSubsystem>())
	{
		LagComp->UnregisterTarget(this);
	}

	Super::EndPlay(EndPlayReason);
}

void ATFPSCharacter::InitializeAbilitySystem()
{
	ATFPSPlayerState* PS = GetPlayerState<ATFPSPlayerState>();
	UTFPSAbilitySystemComponent* ASC = PS ? PS->GetTFPSAbilitySystemComponent() : nullptr;
	if (!ASC)
	{
		return;
	}

	if (AbilitySystemComponent.Get() == ASC && ASC->GetAvatarActor() == this)
	{
		return; // Already initialised; PlayerState can re-replicate without changing.
	}

	// Replication order across actors is not guaranteed: on a client the new pawn's PlayerState can
	// arrive before the old pawn's PlayerState is cleared. Evict the stale avatar first.
	if (ATFPSCharacter* OldAvatar = Cast<ATFPSCharacter>(ASC->GetAvatarActor()); OldAvatar && OldAvatar != this)
	{
		OldAvatar->UninitializeAbilitySystem();
	}

	AbilitySystemComponent = ASC;
	ASC->InitAbilityActorInfo(PS, this);

	if (HasAuthority())
	{
		if (DefaultAbilitySet)
		{
			DefaultAbilitySet->GiveToAbilitySystem(ASC, &GrantedHandles, this);
		}

		WeaponComponent->InitializeWeapons(ASC);

		if (const UTFPSHealthSet* HealthSet = ASC->GetSet<UTFPSHealthSet>())
		{
			OutOfHealthHandle = HealthSet->OnOutOfHealth.AddUObject(this, &ThisClass::HandleOutOfHealth);
		}
	}
}

void ATFPSCharacter::UninitializeAbilitySystem()
{
	UTFPSAbilitySystemComponent* ASC = AbilitySystemComponent.Get();
	if (!ASC)
	{
		return;
	}

	// Only tear down if we are still the avatar; a new pawn may already have taken over.
	if (ASC->GetAvatarActor() == this)
	{
		if (HasAuthority())
		{
			if (const UTFPSHealthSet* HealthSet = ASC->GetSet<UTFPSHealthSet>())
			{
				HealthSet->OnOutOfHealth.Remove(OutOfHealthHandle);
			}

			WeaponComponent->UninitializeWeapons();
			GrantedHandles.TakeFromAbilitySystem(ASC);

			// The dead tag belongs to this body. The ASC outlives it on the PlayerState, so clear it here
			// or the next pawn would spawn with every ability blocked.
			if (bIsDead)
			{
				ASC->RemoveLooseGameplayTag(TFPSGameplayTags::State_Dead);
				ASC->RemoveReplicatedLooseGameplayTag(TFPSGameplayTags::State_Dead);
			}
		}

		ASC->CancelAllAbilities();
		ASC->ClearAbilityInput();
		ASC->RemoveAllGameplayCues();

		if (ASC->GetOwnerActor())
		{
			ASC->SetAvatarActor(nullptr);
		}
		else
		{
			ASC->ClearActorInfo();
		}
	}

	OutOfHealthHandle.Reset();
	AbilitySystemComponent.Reset();
}

void ATFPSCharacter::HandleOutOfHealth(AActor* DamageInstigator, AActor* DamageCauser, const FGameplayEffectSpec* DamageSpec, float DamageMagnitude)
{
	if (!HasAuthority() || bIsDead)
	{
		return;
	}

	bIsDead = true;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSCharacter, bIsDead, this);

	if (UTFPSAbilitySystemComponent* ASC = AbilitySystemComponent.Get())
	{
		ASC->CancelAllAbilities();

		// Loose tags are local-only; the replicated variant is what reaches clients. We need both so the
		// server blocks activations and the owning client stops predicting them.
		ASC->AddLooseGameplayTag(TFPSGameplayTags::State_Dead);
		ASC->AddReplicatedLooseGameplayTag(TFPSGameplayTags::State_Dead);

		// Hook for a server-side death ability (drop weapon, killstreak reset, ...).
		FGameplayEventData Payload;
		Payload.EventTag = TFPSGameplayTags::Event_Death;
		Payload.Instigator = DamageInstigator;
		Payload.Target = this;
		Payload.EventMagnitude = DamageMagnitude;
		if (DamageSpec)
		{
			Payload.OptionalObject = DamageSpec->Def;
			Payload.ContextHandle = DamageSpec->GetEffectContext();
		}
		ASC->HandleGameplayEvent(Payload.EventTag, &Payload);
	}

	HandleDeathPresentation();

	// Don't wait for the next net update slot; death should reach clients this frame.
	ForceNetUpdate();

	OnDied.Broadcast(this, DamageInstigator);

	SetLifeSpan(CorpseLifeSpan);
}

void ATFPSCharacter::OnRep_IsDead()
{
	if (bIsDead)
	{
		HandleDeathPresentation();
	}
}

void ATFPSCharacter::HandleDeathPresentation()
{
	if (bDeathPresentationDone)
	{
		return;
	}
	bDeathPresentationDone = true;

	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->StopMovementImmediately();
	Movement->DisableMovement();

	if (IsLocallyControlled())
	{
		if (UTFPSAbilitySystemComponent* ASC = AbilitySystemComponent.Get())
		{
			ASC->ClearAbilityInput();
		}

		// Swap to the third-person body so the owner sees their own ragdoll.
		Mesh1P->SetVisibility(false, true);
		GetMesh()->SetOwnerNoSee(false);
	}

	if (GetNetMode() == NM_DedicatedServer)
	{
		// Corpses must not absorb shots meant for living players, and the server has no use for a ragdoll.
		GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
	else
	{
		GetMesh()->SetCollisionProfileName(TEXT("Ragdoll"));
		// Corpses must not eat the local player's traces (the server would reject those hits anyway).
		GetMesh()->SetCollisionResponseToChannel(TFPS_TraceChannel_Weapon, ECR_Ignore);
		GetMesh()->SetSimulatePhysics(true);
	}

	K2_OnDeathStarted();
}

void ATFPSCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	const APlayerController* PC = GetController<APlayerController>();
	if (!PC || !InputConfig)
	{
		return;
	}

	if (const ULocalPlayer* LocalPlayer = PC->GetLocalPlayer())
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem = LocalPlayer->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
		{
			if (DefaultMappingContext)
			{
				Subsystem->AddMappingContext(DefaultMappingContext, 0);
			}
		}
	}

	UEnhancedInputComponent* EIC = CastChecked<UEnhancedInputComponent>(PlayerInputComponent);

	if (const UInputAction* Action = InputConfig->FindNativeInputActionForTag(TFPSGameplayTags::InputTag_Move))
	{
		EIC->BindAction(Action, ETriggerEvent::Triggered, this, &ThisClass::Input_Move);
	}
	if (const UInputAction* Action = InputConfig->FindNativeInputActionForTag(TFPSGameplayTags::InputTag_Look))
	{
		EIC->BindAction(Action, ETriggerEvent::Triggered, this, &ThisClass::Input_Look);
	}
	if (const UInputAction* Action = InputConfig->FindNativeInputActionForTag(TFPSGameplayTags::InputTag_Jump))
	{
		EIC->BindAction(Action, ETriggerEvent::Started, this, &ThisClass::Input_JumpPressed);
		EIC->BindAction(Action, ETriggerEvent::Completed, this, &ThisClass::Input_JumpReleased);
	}
	if (const UInputAction* Action = InputConfig->FindNativeInputActionForTag(TFPSGameplayTags::InputTag_Crouch))
	{
		EIC->BindAction(Action, ETriggerEvent::Started, this, &ThisClass::Input_CrouchPressed);
		EIC->BindAction(Action, ETriggerEvent::Completed, this, &ThisClass::Input_CrouchReleased);
	}

	for (const FTFPSInputAction& Binding : InputConfig->AbilityInputActions)
	{
		if (!Binding.InputAction || !Binding.InputTag.IsValid())
		{
			continue;
		}

		EIC->BindAction(Binding.InputAction, ETriggerEvent::Started, this, &ThisClass::Input_AbilityPressed, Binding.InputTag);
		EIC->BindAction(Binding.InputAction, ETriggerEvent::Completed, this, &ThisClass::Input_AbilityReleased, Binding.InputTag);
		// Canceled ends a Hold/Tap trigger without Completed; without this, full-auto fire could stick on.
		EIC->BindAction(Binding.InputAction, ETriggerEvent::Canceled, this, &ThisClass::Input_AbilityReleased, Binding.InputTag);
	}
}

void ATFPSCharacter::Input_Move(const FInputActionValue& Value)
{
	if (bIsDead)
	{
		return;
	}

	const FVector2D Axis = Value.Get<FVector2D>();
	AddMovementInput(GetActorForwardVector(), Axis.Y);
	AddMovementInput(GetActorRightVector(), Axis.X);
}

void ATFPSCharacter::Input_Look(const FInputActionValue& Value)
{
	// Look stays enabled while dead so the death camera can still be steered.
	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X);
	AddControllerPitchInput(Axis.Y);
}

void ATFPSCharacter::Input_JumpPressed()
{
	if (!bIsDead)
	{
		Jump();
	}
}

void ATFPSCharacter::Input_JumpReleased()
{
	StopJumping();
}

void ATFPSCharacter::Input_CrouchPressed()
{
	if (!bIsDead)
	{
		Crouch();
	}
}

void ATFPSCharacter::Input_CrouchReleased()
{
	UnCrouch();
}

void ATFPSCharacter::Input_AbilityPressed(FGameplayTag InputTag)
{
	if (UTFPSAbilitySystemComponent* ASC = AbilitySystemComponent.Get())
	{
		ASC->AbilityInputTagPressed(InputTag);
	}
}

void ATFPSCharacter::Input_AbilityReleased(FGameplayTag InputTag)
{
	if (UTFPSAbilitySystemComponent* ASC = AbilitySystemComponent.Get())
	{
		ASC->AbilityInputTagReleased(InputTag);
	}
}
