#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "UObject/ObjectKey.h"

#include "TFPSLagCompensationSubsystem.generated.h"

class USkeletalMeshComponent;

enum class ETFPSRewindResult : uint8
{
	/** The ray intersects the target's hitboxes at the rewound time. */
	Hit,
	/** The target has history and the ray misses it. */
	Miss,
	/** The target isn't registered (e.g. a drone or turret without a physics asset). Caller decides. */
	NoHistory
};

struct FTFPSRewindHit
{
	FName BoneName;
	FVector ImpactPoint = FVector::ZeroVector;
	float Distance = 0.f;
};

/**
 * Server-side rewind for hitscan hit registration.
 *
 * Every server frame, for each registered character, records the world-space hitbox capsules built
 * from its physics asset into a fixed-size ring buffer. Confirming a hit samples that history at the
 * time the shooter was looking at, interpolates between the two bracketing frames, and ray-tests the
 * interpolated capsules analytically.
 *
 * Rewind is pure math on recorded data: no actor or physics body is ever moved, so it cannot disturb
 * the physics scene, trigger overlaps, or leak rewound state into anything else that ticks this frame.
 *
 * Budget per registered character: roughly 16 bone transforms per frame to record, and
 * (history frames x hitboxes x 24 bytes) of memory. At 60 Hz with 0.5 s of history that is ~12 KB each.
 *
 * Server (authority) only; does nothing on clients.
 */
UCLASS()
class TACTICALFPS_API UTFPSLagCompensationSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	/** Builds hitboxes from Mesh's physics asset (capsules and spheres) and starts recording. */
	void RegisterTarget(AActor* Target, USkeletalMeshComponent* Mesh);
	void UnregisterTarget(AActor* Target);

	/**
	 * Tests a ray against Target as it was at RewindTime (world time seconds). Also samples a small
	 * window either side (tfps.LagComp.JitterWindow) to absorb ping jitter and frame quantisation.
	 * The nearest intersected hitbox wins, so the server, not the client, decides the bone.
	 */
	ETFPSRewindResult ConfirmHit(const AActor* Target, const FVector& RayOrigin, const FVector& RayDirection,
		float RayLength, double RewindTime, FTFPSRewindHit& OutHit) const;

	//~UTickableWorldSubsystem
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;
	//~End UTickableWorldSubsystem

protected:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;

private:
	struct FHitboxDef
	{
		FName BoneName;
		int32 BoneIndex = INDEX_NONE;
		FTransform LocalTransform; // Shape transform relative to its bone; the capsule axis is local Z.
		float Radius = 0.f;
		float HalfLength = 0.f;    // 0 for spheres.
	};

	/** One recorded frame: two segment endpoints per hitbox, plus a bounding sphere for early-out. */
	struct FFrame
	{
		double Time = 0.0;
		float Scale = 1.f;
		FVector3f BoundsCenter = FVector3f::ZeroVector;
		float BoundsRadius = 0.f;
		TArray<FVector3f> Points;
	};

	struct FHistory
	{
		TWeakObjectPtr<USkeletalMeshComponent> Mesh;
		TArray<FHitboxDef> Hitboxes;
		float MaxHitboxRadius = 0.f;
		TArray<FFrame> Frames; // Ring buffer.
		int32 Newest = INDEX_NONE;
		int32 Count = 0;

		const FFrame& FromNewest(int32 Age) const { return Frames[(Newest - Age + Frames.Num()) % Frames.Num()]; }
	};

	void RecordFrame(FHistory& History, double Now) const;
	bool SamplePose(const FHistory& History, double Time, FFrame& OutPose) const;
	bool RayTestPose(const FHistory& History, const FFrame& Pose, const FVector& Origin, const FVector& Direction,
		float Length, FTFPSRewindHit& OutHit) const;

	TMap<TObjectKey<AActor>, FHistory> Histories;

	/** Reused per query to avoid allocating on the hot path. Game thread only. */
	mutable FFrame ScratchPose;
};
