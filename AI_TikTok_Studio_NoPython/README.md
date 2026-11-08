# AI TikTok Studio 2.0 — No Python

Windows desktop app. Python is NOT required on the user's PC.
The Windows executable bundles Electron and FFmpeg. The app uses:
- OpenAI Responses API for Vietnamese script/captions.
- Pexels API for portrait stock footage.
- OpenAI text-to-speech API for narration.
- FFmpeg for 15-second vertical MP4 rendering.

## Important
This project source is provided here. A Windows `.exe` is produced by the GitHub Actions workflow. This environment does not run Windows packaging, so the executable is not falsely represented as already built or tested.

## Build the Windows EXE (one-time developer/build step)
1. Create a GitHub repository and upload the entire folder contents.
2. Open the repository's Actions tab.
3. Select "Build Windows app" and click "Run workflow".
4. When finished, download the `AI-TikTok-Studio-Windows` artifact.
5. The artifact contains the Windows installer and portable executable.

To build locally instead:
- Install Node.js 22 LTS.
- Download a Windows `ffmpeg.exe` and place it at `resources/ffmpeg.exe`.
- Add to `package.json` under `build`: `"extraResources":[{"from":"resources/ffmpeg.exe","to":"ffmpeg.exe"}]`
- Run `npm install`, then `npm run dist`.

## End-user
After downloading the `.exe`, install/run it. No Python or Node.js required on the target PC.
Inside the app enter:
- OpenAI API key (API billing is separate from ChatGPT subscriptions)
- Pexels API key
- model name available to your API account
Leave topic blank for automatic topic selection, then press "TẠO VIDEO 15 GIÂY".

Output folder: Windows Videos\AI TikTok Studio.

## Limitations and rights
- This is automatic editing using stock footage, not a generative text-to-video model.
- Each generation uses API calls and may incur costs.
- Pexels footage licensing and API rules apply; source URL is saved to JSON metadata.
- Check AI-generated factual claims, music/footage rights, and TikTok policies before publishing.
- No auto-posting to TikTok.
- Default model is configurable in the app; use a model enabled for your API account.
