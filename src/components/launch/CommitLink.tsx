import { ReactNode } from 'react';
import { Anchor, Text } from '@mantine/core';

const REPOS: Record<string, string> = {
  python: 'https://github.com/gnome-trading-group/gnomepy-research',
  java: 'https://github.com/gnome-trading-group/gnome-strategies',
};

export function commitLabel(strategyType: unknown): string {
  return strategyType === 'java' ? 'Strategy commit' : 'Research commit';
}

// The commit a session runs, from its own language's repo. A ref left unset in a launch setting is main as of the
// launch, which the session row then records as a SHA.
export function CommitLink({ strategyType, commit, ifUnset }: {
  strategyType: unknown;
  commit: string | null | undefined;
  ifUnset?: ReactNode;
}) {
  const repo = REPOS[String(strategyType ?? '')];
  if (!commit) return <>{ifUnset ?? <Text span size="sm" c="orange">main at launch time</Text>}</>;
  if (!repo) return <Text span size="sm" ff="monospace">{commit.slice(0, 10)}</Text>;
  return (
    <Anchor href={`${repo}/commit/${commit}`} target="_blank" size="sm" ff="monospace">{commit.slice(0, 10)}</Anchor>
  );
}
