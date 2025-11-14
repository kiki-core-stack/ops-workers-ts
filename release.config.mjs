const releaseNoteConfigTypesAndSections = {
    '*': '📌 Others',
    'build': '📦 Build',
    'chore': '🏡 Chore',
    'ci': '🤖 CI',
    'docs': '📖 Documentation',
    'examples': '🏀 Examples',
    'feat': '🚀 Enhancements',
    'fix': '🩹 Fixes',
    'perf': '🔥 Performance',
    'refactor': '💅 Refactors',
    'style': '🎨 Styles',
    'test': '✅ Tests',
    'types': '🌊 Types',
};

const releasePatchRuleTypes = [
    'build',
    'chore',
    'refactor',
    'style',
];

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
    branches: ['main'],
    plugins: [
        [
            '@semantic-release/commit-analyzer',
            {
                preset: 'conventionalcommits',
                releaseRules: releasePatchRuleTypes.map((type) => ({
                    release: 'patch',
                    type,
                })),
            },
        ],
        [
            '@semantic-release/release-notes-generator',
            {
                preset: 'conventionalcommits',
                presetConfig: {
                    types: Object.entries(releaseNoteConfigTypesAndSections).map(([type, section]) => ({
                        hidden: false,
                        section,
                        type,
                    })),
                },
            },
        ],
        '@semantic-release/changelog',
        [
            '@semantic-release/git',
            // eslint-disable-next-line no-template-curly-in-string
            { message: 'chore(release): ${nextRelease.version} [skip ci]' },
        ],
        '@semantic-release/gitlab',
    ],
};
