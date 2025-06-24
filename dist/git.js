import { simpleGit } from 'simple-git';
export async function getGitDiff() {
    const git = simpleGit();
    return await git.diff();
}
