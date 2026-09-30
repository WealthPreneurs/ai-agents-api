#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"

#include "TFPSTeamAgentInterface.generated.h"

UINTERFACE(MinimalAPI, Meta = (CannotImplementInterfaceInBlueprint))
class UTFPSTeamAgentInterface : public UInterface
{
	GENERATED_BODY()
};

/**
 * Anything that belongs to a team. The PlayerState is the source of truth; pawns forward to it, so team
 * identity survives death, respawn and seamless travel.
 */
class TACTICALFPS_API ITFPSTeamAgentInterface
{
	GENERATED_BODY()

public:
	static constexpr uint8 NoTeam = 255;

	virtual uint8 GetTFPSTeamId() const = 0;
};

namespace TFPSTeams
{
	/** Team of any object implementing ITFPSTeamAgentInterface; NoTeam otherwise. */
	TACTICALFPS_API uint8 GetTeamId(const UObject* Object);

	/** True only when both are on the same, valid team. */
	TACTICALFPS_API bool AreSameTeam(const UObject* A, const UObject* B);
}
