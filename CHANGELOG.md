# Changelog

All notable changes to Mise en Place will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT license file
- API key validation in settings with test connection buttons
- Rate limiting for recipe URL fetching (2-second minimum delay)
- Timeout/abort support for network requests (30s HTML, 60s images)
- Image dimension limit (800px max in any direction)
- Image size limit (10MB maximum)
- Todoist project ID configuration in settings
- Infinite loop protection in archive path generation
- Improved error logging with structured context
- Recipe Database virtualization for faster rendering
- Enhanced image lazy loading with intersection observer
- Privacy documentation for CORS proxy usage

### Changed
- Todoist task creation now uses parallel requests (batch API)
- Error messages sanitized to prevent sensitive data exposure
- Ledger persistence now handles failures with retry logic
- File processing includes race condition protection
- Regex patterns compiled as constants for better performance
- GeminiService uses proper TypeScript types instead of `any`

### Fixed
- Unhandled promise rejections in ledger flush
- Potential infinite loop in archive path generation
- Race condition in inbox file processing
- Sequential Todoist API calls blocking each other

## [0.1.0] - 2026-01-08

### Added
- Initial release
- Async inbox capture for URL, text, and image recipes
- Deterministic-first extraction with Gemini fallback
- Weekly Organiser for meal planning
- Recipe Database view with search and filters
- Todoist shopping list integration
- Health view for monitoring inbox processing
