# Genre Video Generator

A Node.js module that generates custom video compilations based on genre-specific scenes from a source video. This tool analyzes video segments using genre attributes and creates a new video containing the most relevant scenes for selected genres.

## Features

- Filter and extract scenes based on multiple genre preferences
- Score-based scene selection and sorting
- Configurable minimum score threshold for scene selection
- Customizable maximum duration for output video
- Smooth transitions between scenes
- Batch processing support for efficient video handling
- Maintains both video and audio synchronization
- Temporary file cleanup after processing

## Prerequisites

- Node.js (v12 or higher recommended)
- FFmpeg installed on your system
- Sufficient disk space for temporary files

## Installation

1. Install the required dependencies:

```bash
npm install
```

2. Ensure FFmpeg is installed on your system:
   - For Mac: `brew install ffmpeg`
   - For Ubuntu/Debian: `sudo apt-get install ffmpeg`
   - For Windows: Download from FFmpeg website and add to system PATH

## Usage

```javascript
const GenreVideoGenerator = require('./GenreVideoGenerator');

const generator = new GenreVideoGenerator();

// Example scene data structure
const sceneData = [
    {
        "start": "00:00",
        "end": "00:30",
        "attributes": {
            "1": 7,  // Action
            "2": 0,  // Comedy
            "3": 0,  // Romance
            "4": 5,  // Drama
            // ... other genre scores
        }
    },
    // ... more scenes
];

// Generate custom video
const result = await generator.generateCustomVideo(
    'input-video.mp4',
    sceneData,
    [1, 4],  // Select Action and Drama genres
    {
        minScore: 5,        // Minimum genre score to include scene
        maxDuration: 60,    // Maximum output duration in seconds
        transitionDuration: 0.5,  // Transition duration between scenes
        batchSize: 5        // Number of scenes to process in each batch
    }
);
```

## Genre Mapping

The module uses a numeric mapping for genres:
- 1: Action
- 2: Comedy
- 3: Romance
- 4: Drama
- 5: Thriller
- 6: Crime
- 7: Fantasy
- 8: Thriller
- 9: Documentary
- 10: Sci-fi

## Scene Data Format

Scene data should be provided as an array of objects with the following structure:

```javascript
{
    "start": "MM:SS",    // Start time in minutes:seconds
    "end": "MM:SS",      // End time in minutes:seconds
    "attributes": {
        "1": 0-10,       // Score for each genre (0-10)
        "2": 0-10,
        // ... scores for all genres
    }
}
```

## Options

The `generateCustomVideo` method accepts the following options:

- `minScore` (number): Minimum genre score required to include a scene
- `maxDuration` (number): Maximum duration of the output video in seconds
- `transitionDuration` (number): Duration of crossfade transitions between scenes
- `batchSize` (number): Number of scenes to process in each batch

## Return Value

The `generateCustomVideo` method returns an object containing:

```javascript
{
    outputPath: string,    // Path to the generated video file
    scenes: array,         // Array of selected scenes
    totalDuration: number  // Total duration in seconds
}
```

## Error Handling

The module includes comprehensive error handling for:
- Invalid input video files
- Missing or malformed scene data
- FFmpeg processing errors
- File system operations
- Temporary file management

## Temporary Files

The module creates and manages temporary files in a `temp` directory within the current working directory. These files are automatically cleaned up after processing is complete.

## Performance Considerations

- Large videos are processed in batches to manage memory usage
- Temporary files are used to handle intermediate processing steps
- Scene selection is optimized to minimize processing time
- FFmpeg commands are structured for efficient video processing

## Limitations

- Input video must be accessible via local file system
- Scene times must be in MM:SS format
- Genre scores must be numbers between 0 and 10
- Requires sufficient disk space for temporary files
- Processing time depends on video length and quality

## Contributing

Feel free to submit issues and enhancement requests.
