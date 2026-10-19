import { rm } from 'node:fs/promises';
import {
    join,
    relative,
} from 'node:path';

import prettyBytes from 'pretty-bytes';

export type BuildOptions = Partial<Pick<Bun.BuildConfig, 'entrypoints' | 'plugins' | 'root' | 'splitting'>>;

export async function runBuild(options: BuildOptions = {}) {
    const projectDirectoryPath = import.meta.dirname;
    const outputDirectoryPath = join(projectDirectoryPath, 'dist');
    await rm(
        outputDirectoryPath,
        {
            force: true,
            recursive: true,
        },
    );

    const buildResult = await Bun.build({
        entrypoints: options.entrypoints ?? [join(projectDirectoryPath, 'src/index.ts')],
        minify: true,
        outdir: outputDirectoryPath,
        packages: 'external',
        plugins: options.plugins,
        root: options.root,
        splitting: options.splitting,
        target: 'bun',
        throw: false,
    });

    for (const log of buildResult.logs) console.error(log);
    if (!buildResult.success) throw new Error('Application build failed');

    const outputs = buildResult.outputs
        .map((output) => ({
            path: relative(outputDirectoryPath, output.path),
            size: output.size,
        }))
        .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path));

    const outputPathColumnWidth = Math.max(0, ...outputs.map((output) => output.path.length));
    const totalOutputSizeBytes = outputs.reduce((total, output) => total + output.size, 0);
    const outputLines = outputs.map(
        (output) => `  ${output.path.padEnd(outputPathColumnWidth)}  ${prettyBytes(output.size)}`,
    );

    process.stdout.write([
        'Build completed',
        '',
        'Outputs (dist/):',
        ...outputLines,
        '',
        // eslint-disable-next-line style/max-len
        `Total output: ${outputs.length} ${outputs.length === 1 ? 'file' : 'files'}, ${prettyBytes(totalOutputSizeBytes)}`,
        '',
    ].join('\n'));

    return buildResult;
}

if (import.meta.main) await runBuild();
