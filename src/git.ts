import { simpleGit } from 'simple-git';

export async function getGitDiff(): Promise<string> {
  const git = simpleGit();
  return await git.diff();
}