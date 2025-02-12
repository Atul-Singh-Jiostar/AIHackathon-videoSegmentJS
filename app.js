const ffmpeg = require('fluent-ffmpeg');
const fsPromises = require('fs').promises;
const fs = require('fs');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

const path = require('path');


class GenreVideoGenerator {
    constructor() {
        this.genreMap = {
            1: 'Action',
            2: 'Comedy',
            3: 'Romance',
            4: 'Drama',
            5: 'Thriller',
            6: 'Crime',
            7: 'Fantasy',
            8: 'Thriller',
            9: 'Documentary',
            10: 'Sci-fi'
        };

        // Create temp directory in current working directory
        this.tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir);
        }
    }

    async generateCustomVideo(inputVideo, sceneData, selectedGenres, options = {}) {
        const { minScore, maxDuration, transitionDuration, batchSize } = options;

        try {
            const relevantScenes = this.filterRelevantScenes(sceneData, selectedGenres, minScore);
            const sortedScenes = this.sortScenesByScore(relevantScenes, selectedGenres);
            const selectedScenes = this.selectScenes(sortedScenes, maxDuration);

            if (selectedScenes.length === 0) {
                throw new Error('No suitable scenes found for the selected genres');
            }

            const batches = this.createBatches(selectedScenes, batchSize);
            const batchFiles = [];

            for (let i = 0; i < batches.length; i++) {
                const batchOutputPath = `./temp/batch_${i}.mp4`;
                await this.processSceneBatch(inputVideo, batches[i], batchOutputPath, transitionDuration);
                batchFiles.push(batchOutputPath);
            }

            const outputPath = `custom_video_${selectedGenres.join('_')}_${Date.now()}.mp4`;
            await this.concatenateVideos(batchFiles, outputPath);
            await this.cleanup(batchFiles);

            return {
                outputPath,
                scenes: selectedScenes,
                totalDuration: this.calculateTotalDuration(selectedScenes)
            };
        } catch (error) {
            console.error('Error generating custom video:', error);
            throw error;
        }
    }

    async concatenateVideos(inputFiles, outputPath) {
        // Convert to absolute paths
        const absoluteInputFiles = inputFiles.map(file =>
            path.resolve(file)
        );
        const absoluteListPath = path.join(this.tempDir, 'files.txt');

        // Create file list with absolute paths
        const fileList = absoluteInputFiles
            .map(file => `file '${file}'`)
            .join('\n');

        await fsPromises.writeFile(absoluteListPath, fileList);
        console.log('Created concat list at:', absoluteListPath);
        console.log('File contents:', fileList);

        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(absoluteListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .output(path.resolve(outputPath))
                .outputOptions('-c copy')
                .on('start', cmdLine => console.log('FFmpeg started:', cmdLine))
                .on('error', (err, stdout, stderr) => {
                    console.error('FFmpeg stderr:', stderr);
                    reject(err);
                })
                .on('end', resolve)
                .run();
        });
    }

    async cleanup(files) {
        for (const file of files) {
            try {
                await fsPromises.unlink(file);
            } catch (error) {
                console.error(`Error deleting file ${file}:`, error);
            }
        }
        try {
            await fsPromises.unlink('./temp/files.txt');
        } catch (error) {
            console.error('Error deleting file list:', error);
        }
    }

    filterRelevantScenes(sceneData, selectedGenres, minScore) {
        return sceneData.filter(scene => {
            return selectedGenres.some(genre =>
                scene.attributes[genre] >= minScore
            );
        }).map(scene => ({
            ...scene,
            startSeconds: this.timeToSeconds(scene.start),
            endSeconds: this.timeToSeconds(scene.end),
            maxGenreScore: Math.max(...selectedGenres.map(genre =>
                scene.attributes[genre]
            ))
        }));
    }

    sortScenesByScore(scenes, selectedGenres) {
        return [...scenes].sort((a, b) => {
            const scoreA = Math.max(...selectedGenres.map(genre => a.attributes[genre]));
            const scoreB = Math.max(...selectedGenres.map(genre => b.attributes[genre]));
            return scoreB - scoreA;
        });
    }

    selectScenes(sortedScenes, maxDuration) {
        const selectedScenes = [];
        let currentDuration = 0;

        for (const scene of sortedScenes) {
            const sceneDuration = scene.endSeconds - scene.startSeconds;
            if (currentDuration + sceneDuration <= maxDuration) {
                selectedScenes.push(scene);
                currentDuration += sceneDuration;
            }
        }

        return selectedScenes.sort((a, b) => a.startSeconds - b.startSeconds);
    }

    calculateTotalDuration(scenes) {
        return scenes.reduce((total, scene) =>
            total + (scene.endSeconds - scene.startSeconds),
            0
        );
    }

    timeToSeconds(timeStr) {
        const [minutes, seconds] = timeStr.split(':').map(Number);
        return minutes * 60 + seconds;
    }

    createBatches(scenes, batchSize) {
        const batches = [];
        for (let i = 0; i < scenes.length; i += batchSize) {
            batches.push(scenes.slice(i, i + batchSize));
        }
        return batches;
    }

    async processSceneBatch(inputVideo, scenes, outputPath, transitionDuration) {
        return new Promise((resolve, reject) => {
            const command = ffmpeg();
            command.input(inputVideo);

            const filterComplex = [];
            const inputs = [];

            scenes.forEach((scene, index) => {
                // Extract scene
                filterComplex.push(
                    `[0:v]trim=start=${scene.startSeconds}:end=${scene.endSeconds},` +
                    `setpts=PTS-STARTPTS[v${index}];` +
                    `[0:a]atrim=start=${scene.startSeconds}:end=${scene.endSeconds},` +
                    `asetpts=PTS-STARTPTS[a${index}]`
                );

                // Add crossfade
                if (index > 0) {
                    filterComplex.push(
                        `[v${index}]fade=in:st=0:d=${transitionDuration}[fv${index}]`
                    );
                    inputs.push(`[fv${index}][a${index}]`);
                } else {
                    inputs.push(`[v${index}][a${index}]`);
                }
            });

            // Add concatenation
            const concatFilter = `${inputs.join('')}concat=n=${scenes.length}:v=1:a=1[outv][outa]`;
            filterComplex.push(concatFilter);

            command
                .complexFilter(filterComplex.join(';'))
                .map('[outv]')
                .map('[outa]')
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
    }
}

async function main() {
    const generator = new GenreVideoGenerator();

    try {
        const sceneData = [
            {
                "start": "00:00",
                "end": "00:02",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 0,
                    "5": 0,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "00:02",
                "end": "00:06",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 3,
                    "5": 0,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "00:06",
                "end": "00:17",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 0,
                    "5": 0,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "00:17",
                "end": "00:31",
                "attributes": {
                    "1": 5,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 0,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "00:31",
                "end": "00:52",
                "attributes": {
                    "1": 5,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 0,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "00:52",
                "end": "01:17",
                "attributes": {
                    "1": 5,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 0,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "01:17",
                "end": "01:28",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 6,
                    "5": 6,
                    "6": 5,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "01:28",
                "end": "01:53",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 6,
                    "5": 6,
                    "6": 5,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "01:53",
                "end": "02:02",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 6,
                    "5": 6,
                    "6": 5,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "02:02",
                "end": "02:04",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 0,
                    "5": 0,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 4
                }
            },
            {
                "start": "02:04",
                "end": "02:50",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 0,
                    "5": 4,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 8
                }
            },
            {
                "start": "02:50",
                "end": "03:21",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 8,
                    "5": 4,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "03:21",
                "end": "03:51",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 4,
                    "5": 7,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 7
                }
            },
            {
                "start": "03:51",
                "end": "04:26",
                "attributes": {
                    "1": 0,
                    "2": 1,
                    "3": 0,
                    "4": 0,
                    "5": 0,
                    "6": 4,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "04:26",
                "end": "05:12",
                "attributes": {
                    "1": 2,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 4,
                    "6": 8,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "05:12",
                "end": "05:55",
                "attributes": {
                    "1": 0,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 0,
                    "6": 8,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "05:55",
                "end": "06:04",
                "attributes": {
                    "1": 3,
                    "2": 1,
                    "3": 0,
                    "4": 6,
                    "5": 0,
                    "6": 8,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "06:04",
                "end": "06:27",
                "attributes": {
                    "1": 0,
                    "2": 2,
                    "3": 0,
                    "4": 7,
                    "5": 0,
                    "6": 8,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "06:27",
                "end": "06:52",
                "attributes": {
                    "1": 6,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 5,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "06:52",
                "end": "07:55",
                "attributes": {
                    "1": 5,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 0,
                    "6": 6,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "07:55",
                "end": "08:16",
                "attributes": {
                    "1": 4,
                    "2": 0,
                    "3": 0,
                    "4": 7,
                    "5": 6,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
            {
                "start": "08:16",
                "end": "09:21",
                "attributes": {
                    "1": 4,
                    "2": 0,
                    "3": 0,
                    "4": 4,
                    "5": 8,
                    "6": 0,
                    "7": 0,
                    "8": 0,
                    "9": 0,
                    "10": 0
                }
            },
        ];

        const result = await generator.generateCustomVideo(
            'movie.mp4',
            sceneData,
            [1, 4], // genres Selecting Action And Drama
            {
                minScore: 5,
                maxDuration: 60,
                transitionDuration: 0.5,
                batchSize: 5
            }
        );

        console.log('Custom video generated successfully!');
        console.log('Output path:', result.outputPath);
        console.log('Selected scenes:', result.scenes.length);
        console.log('Total duration:', result.totalDuration, 'seconds');

    } catch (error) {
        console.error('Error:', error);
    }
}

main();

module.exports = GenreVideoGenerator;