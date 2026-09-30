#include "Teams/TFPSTeamAgentInterface.h"

uint8 TFPSTeams::GetTeamId(const UObject* Object)
{
	const ITFPSTeamAgentInterface* Agent = Cast<ITFPSTeamAgentInterface>(Object);
	return Agent ? Agent->GetTFPSTeamId() : ITFPSTeamAgentInterface::NoTeam;
}

bool TFPSTeams::AreSameTeam(const UObject* A, const UObject* B)
{
	const uint8 TeamA = GetTeamId(A);
	return TeamA != ITFPSTeamAgentInterface::NoTeam && TeamA == GetTeamId(B);
}
