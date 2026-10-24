import { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';

// Curated language color mapping matching GitHub's official colors
const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Rust: '#dea584',
  Go: '#00ADD8',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Java: '#b07219',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  SCSS: '#c6538c',
  R: '#198CE7',
  Jupyter: '#DA5B0B',
};

const DEFAULT_SUGGESTIONS = ['octocat', 'torvalds', 'gaearon', 'shadcn', 'yyx990803'];

function App() {
  const [usernameInput, setUsernameInput] = useState('');
  const [searchedUser, setSearchedUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('gh_search_history');
      return saved ? JSON.parse(saved) : DEFAULT_SUGGESTIONS;
    } catch {
      return DEFAULT_SUGGESTIONS;
    }
  });

  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('gh_finder_theme');
      if (savedTheme) return savedTheme;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
    } catch {
      return 'dark';
    }
  });

  // Repository filter and sort state
  const [repoQuery, setRepoQuery] = useState('');
  const [repoSort, setRepoSort] = useState('updated'); // 'updated', 'stars', 'forks', 'name'
  const [avatarError, setAvatarError] = useState(false);

  // Sync theme with DOM and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('gh_finder_theme', theme);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch GitHub User and Repositories
  const fetchGitHubUser = useCallback(async (usernameToFetch) => {
    const trimmed = (usernameToFetch || '').trim();
    if (!trimmed) {
      setError({
        type: 'validation',
        message: 'Please enter a GitHub username to search.',
      });
      return;
    }

    setLoading(true);
    setError(null);
    setAvatarError(false);
    setRepoQuery('');

    try {
      // 1. Fetch user profile
      const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(trimmed)}`);

      if (!userRes.ok) {
        if (userRes.status === 404) {
          throw new Error(`User "${trimmed}" was not found. Please verify the username and try again.`);
        }
        if (userRes.status === 403) {
          throw new Error('GitHub API rate limit reached (60 requests/hr). Please try again shortly.');
        }
        throw new Error(`Failed to fetch user (HTTP ${userRes.status}). Please try again.`);
      }

      const userData = await userRes.json();

      // 2. Fetch user repositories (up to 100, sorted by updated)
      let reposData = [];
      try {
        const reposRes = await fetch(
          `https://api.github.com/users/${encodeURIComponent(trimmed)}/repos?sort=updated&per_page=100`
        );
        if (reposRes.ok) {
          reposData = await reposRes.json();
        }
      } catch (repoErr) {
        console.warn('Could not load repos:', repoErr);
      }

      setSearchedUser(userData);
      setRepos(Array.isArray(reposData) ? reposData : []);

      // 3. Update search history
      setSearchHistory((prevHistory) => {
        const normalized = userData.login;
        const filtered = prevHistory.filter(
          (item) => item.toLowerCase() !== normalized.toLowerCase()
        );
        const updated = [normalized, ...filtered].slice(0, 8);
        try {
          localStorage.setItem('gh_search_history', JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed saving search history:', e);
        }
        return updated;
      });
    } catch (err) {
      setError({
        type: 'error',
        message: err.message || 'An unexpected error occurred while fetching the profile.',
      });
      setSearchedUser(null);
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load a default user on initial render
  useEffect(() => {
    fetchGitHubUser('octocat');
  }, [fetchGitHubUser]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      setError({
        type: 'validation',
        message: 'Please enter a GitHub username to search.',
      });
      return;
    }
    fetchGitHubUser(usernameInput);
  };

  const handleHistoryClick = (name) => {
    setUsernameInput(name);
    fetchGitHubUser(name);
  };

  const removeHistoryItem = (e, nameToRemove) => {
    e.stopPropagation();
    setSearchHistory((prev) => {
      const updated = prev.filter((item) => item.toLowerCase() !== nameToRemove.toLowerCase());
      try {
        localStorage.setItem('gh_search_history', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed saving search history:', err);
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setSearchHistory([]);
    try {
      localStorage.removeItem('gh_search_history');
    } catch (err) {
      console.warn('Failed clearing search history:', err);
    }
  };

  // Filter and sort repositories
  const filteredAndSortedRepos = useMemo(() => {
    let result = [...repos];

    // Filter by query
    if (repoQuery.trim()) {
      const q = repoQuery.toLowerCase().trim();
      result = result.filter(
        (repo) =>
          repo.name.toLowerCase().includes(q) ||
          (repo.description && repo.description.toLowerCase().includes(q)) ||
          (repo.language && repo.language.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      if (repoSort === 'stars') {
        return (b.stargazers_count || 0) - (a.stargazers_count || 0);
      }
      if (repoSort === 'forks') {
        return (b.forks_count || 0) - (a.forks_count || 0);
      }
      if (repoSort === 'name') {
        return a.name.localeCompare(b.name);
      }
      // default: updated
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    return result;
  }, [repos, repoQuery, repoSort]);

  // Format creation date
  const formatJoinedDate = (iso) => {
    if (!iso) return 'Unknown date';
    const d = new Date(iso);
    return `Joined ${d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  };

  // Format relative updated time
  const formatRelativeTime = (iso) => {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Updated today';
    if (diffDays === 1) return 'Updated yesterday';
    if (diffDays < 30) return `Updated ${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `Updated ${diffMonths}mo ago`;
    const diffYears = Math.floor(diffDays / 365);
    return `Updated ${diffYears}y ago`;
  };

  // Clean blog url
  const formatBlogUrl = (blog) => {
    if (!blog) return null;
    return blog.startsWith('http://') || blog.startsWith('https://')
      ? blog
      : `https://${blog}`;
  };

  return (
    <div className="app-container">
      {/* Background Decorative Blur Spheres */}
      <div className="bg-glow-container" aria-hidden="true">
        <div className="bg-glow-top-left"></div>
        <div className="bg-glow-top-right"></div>
      </div>

      {/* Main App Content Wrapper */}
      <div className="content-wrapper">
        {/* Navigation / Header */}
        <header className="app-header">
          <div className="brand-group">
            <div className="brand-icon">
              {/* GitHub Octocat SVG */}
              <svg height="32" viewBox="0 0 16 16" width="32" fill="currentColor">
                <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
              </svg>
            </div>
            <div>
              <h1 className="brand-title">GitHub Profile Finder</h1>
              <p className="brand-subtitle">
                Search developers, explore stats, inspect repositories &amp; followings
              </p>
            </div>
          </div>

          {/* Theme Toggle Button */}
          <button
            id="theme-toggle-btn"
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? (
              <>
                <svg className="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span className="theme-label">Light Mode</span>
              </>
            ) : (
              <>
                <svg className="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="theme-label">Dark Mode</span>
              </>
            )}
          </button>
        </header>

        {/* Search Bar Section */}
        <section className="search-section" aria-label="Search Form">
          <form className="search-form" onSubmit={handleSearchSubmit}>
            <div className="search-input-wrapper">
              <svg className="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>

              <input
                id="github-search-input"
                type="text"
                className="search-input"
                placeholder="Search any GitHub username (e.g. torvalds, gaearon, octocat)..."
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                autoComplete="off"
                spellCheck="false"
                aria-label="GitHub username search input"
              />

              {usernameInput && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setUsernameInput('')}
                  aria-label="Clear search input"
                  title="Clear input"
                >
                  &times;
                </button>
              )}
            </div>

            <button
              id="github-search-btn"
              type="submit"
              className="search-submit-btn"
              disabled={loading}
              aria-label="Search GitHub User"
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true"></span>
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>Search</span>
                </>
              )}
            </button>
          </form>

          {/* Search History Chips */}
          {searchHistory.length > 0 && (
            <div className="search-history-container">
              <div className="search-history-header">
                <span className="history-title">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Recent Searches
                </span>
                <button
                  type="button"
                  className="history-clear-btn"
                  onClick={clearHistory}
                  title="Clear all recent searches"
                >
                  Clear all
                </button>
              </div>

              <div className="history-chips-row">
                {searchHistory.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`history-chip ${
                      searchedUser?.login?.toLowerCase() === name.toLowerCase() ? 'active' : ''
                    }`}
                    onClick={() => handleHistoryClick(name)}
                    title={`Search @${name}`}
                  >
                    <span className="history-chip-at">@</span>
                    <span className="history-chip-text">{name}</span>
                    <span
                      className="history-chip-delete"
                      onClick={(e) => removeHistoryItem(e, name)}
                      title={`Remove ${name} from history`}
                      aria-label={`Remove ${name}`}
                    >
                      &times;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Validation or Error State */}
        {error && (
          <div className="status-banner error-banner" role="alert">
            <div className="status-banner-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div className="status-banner-content">
              <h3 className="status-title">Unable to find user</h3>
              <p className="status-text">{error.message}</p>
              <div className="status-suggestions">
                <span>Try exploring:</span>
                {DEFAULT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="quick-suggestion-btn"
                    onClick={() => handleHistoryClick(suggestion)}
                  >
                    @{suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="skeleton-container" aria-busy="true" aria-label="Loading profile">
            <div className="skeleton-card profile-skeleton">
              <div className="skeleton-header">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-header-info">
                  <div className="skeleton-line line-title"></div>
                  <div className="skeleton-line line-subtitle"></div>
                  <div className="skeleton-line line-bio"></div>
                </div>
              </div>
              <div className="skeleton-stats-grid">
                <div className="skeleton-stat-box"></div>
                <div className="skeleton-stat-box"></div>
                <div className="skeleton-stat-box"></div>
                <div className="skeleton-stat-box"></div>
              </div>
            </div>

            <div className="skeleton-repos-grid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="skeleton-card repo-skeleton-card">
                  <div className="skeleton-line line-repo-title"></div>
                  <div className="skeleton-line line-repo-desc"></div>
                  <div className="skeleton-line line-repo-meta"></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile Card & Repositories Display */}
        {!loading && searchedUser && (
          <main className="results-container">
            {/* Main Profile Showcase Card */}
            <article className="profile-card">
              <div className="profile-header-row">
                {/* User Avatar */}
                <div className="avatar-wrapper">
                  {!avatarError ? (
                    <img
                      src={searchedUser.avatar_url}
                      alt={`${searchedUser.name || searchedUser.login}'s avatar`}
                      className="profile-avatar"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className="avatar-fallback" aria-label="Avatar placeholder">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                  )}
                  {searchedUser.hireable && (
                    <span className="hireable-badge" title="Available for hire">
                      Available
                    </span>
                  )}
                </div>

                {/* Core Profile Info */}
                <div className="profile-identity">
                  <div className="profile-name-row">
                    <div>
                      <h2 className="profile-name">{searchedUser.name || searchedUser.login}</h2>
                      <a
                        href={searchedUser.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="profile-username"
                        title="Open GitHub Profile"
                      >
                        @{searchedUser.login}
                      </a>
                    </div>

                    {/* Visit Profile External CTA Button */}
                    <a
                      id="visit-github-profile-btn"
                      href={searchedUser.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="visit-profile-btn"
                      title={`Visit ${searchedUser.login}'s GitHub profile in a new tab`}
                    >
                      <span>Visit GitHub Profile</span>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  </div>

                  {/* Profile Bio */}
                  <p className={`profile-bio ${!searchedUser.bio ? 'empty-bio' : ''}`}>
                    {searchedUser.bio ? searchedUser.bio : 'This profile does not have a bio yet.'}
                  </p>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon-wrapper repos-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">Public Repos</span>
                    <strong className="stat-value">{searchedUser.public_repos.toLocaleString()}</strong>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-wrapper followers-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">Followers</span>
                    <strong className="stat-value">{searchedUser.followers.toLocaleString()}</strong>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-wrapper following-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="8.5" cy="7" r="4"></circle>
                      <line x1="20" y1="8" x2="20" y2="14"></line>
                      <line x1="23" y1="11" x2="17" y2="11"></line>
                    </svg>
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">Following</span>
                    <strong className="stat-value">{searchedUser.following.toLocaleString()}</strong>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-wrapper gists-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6"></polyline>
                      <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">Public Gists</span>
                    <strong className="stat-value">{searchedUser.public_gists.toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              {/* Extended Metadata Grid: Location, Company, Blog, Twitter, Date */}
              <div className="metadata-grid">
                {/* Location */}
                <div className={`meta-item ${!searchedUser.location ? 'meta-empty' : ''}`}>
                  <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <span className="meta-text">{searchedUser.location || 'Not Specified'}</span>
                </div>

                {/* Company */}
                <div className={`meta-item ${!searchedUser.company ? 'meta-empty' : ''}`}>
                  <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                  <span className="meta-text">{searchedUser.company || 'Not Specified'}</span>
                </div>

                {/* Website / Blog */}
                <div className={`meta-item ${!searchedUser.blog ? 'meta-empty' : ''}`}>
                  <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                  </svg>
                  {searchedUser.blog ? (
                    <a
                      href={formatBlogUrl(searchedUser.blog)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="meta-link"
                    >
                      {searchedUser.blog.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <span className="meta-text">Not Specified</span>
                  )}
                </div>

                {/* Twitter / X */}
                <div className={`meta-item ${!searchedUser.twitter_username ? 'meta-empty' : ''}`}>
                  <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
                  </svg>
                  {searchedUser.twitter_username ? (
                    <a
                      href={`https://x.com/${searchedUser.twitter_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="meta-link"
                    >
                      @{searchedUser.twitter_username}
                    </a>
                  ) : (
                    <span className="meta-text">Not Specified</span>
                  )}
                </div>

                {/* Joined Date */}
                <div className="meta-item">
                  <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span className="meta-text">{formatJoinedDate(searchedUser.created_at)}</span>
                </div>
              </div>
            </article>

            {/* Repositories Section */}
            <section className="repositories-section" aria-label="User Repositories">
              <div className="repositories-header">
                <div className="repositories-title-group">
                  <h3 className="section-title">
                    Public Repositories
                    <span className="repo-count-badge">{filteredAndSortedRepos.length}</span>
                  </h3>
                  <p className="section-description">
                    Displaying up to 100 recent public repositories from @{searchedUser.login}
                  </p>
                </div>

                {/* Filter and Sort Repositories Toolbar */}
                <div className="repo-toolbar">
                  {/* Search within repositories */}
                  <div className="repo-search-box">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                      type="text"
                      placeholder="Filter repositories..."
                      value={repoQuery}
                      onChange={(e) => setRepoQuery(e.target.value)}
                      className="repo-search-input"
                      aria-label="Filter repositories by name or topic"
                    />
                    {repoQuery && (
                      <button
                        type="button"
                        className="repo-filter-clear"
                        onClick={() => setRepoQuery('')}
                        title="Clear filter"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  {/* Sort dropdown */}
                  <div className="repo-sort-box">
                    <label htmlFor="repo-sort-select" className="sort-label">
                      Sort by:
                    </label>
                    <select
                      id="repo-sort-select"
                      value={repoSort}
                      onChange={(e) => setRepoSort(e.target.value)}
                      className="repo-sort-select"
                    >
                      <option value="updated">Recently Updated</option>
                      <option value="stars">Most Stars</option>
                      <option value="forks">Most Forks</option>
                      <option value="name">Name (A-Z)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Repositories Cards Grid */}
              {filteredAndSortedRepos.length > 0 ? (
                <div className="repositories-grid">
                  {filteredAndSortedRepos.map((repo) => (
                    <div key={repo.id} className="repo-card">
                      <div className="repo-card-top">
                        <div className="repo-name-wrapper">
                          <svg className="repo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                          </svg>
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="repo-name"
                            title={`Open ${repo.name} on GitHub`}
                          >
                            {repo.name}
                          </a>
                        </div>
                        <div className="repo-badges">
                          {repo.fork && <span className="fork-badge">Fork</span>}
                          <span className="visibility-badge">
                            {repo.visibility ? repo.visibility : 'Public'}
                          </span>
                        </div>
                      </div>

                      <p className="repo-description">
                        {repo.description || 'No description provided for this repository.'}
                      </p>

                      <div className="repo-card-bottom">
                        {/* Language */}
                        {repo.language ? (
                          <div className="repo-language">
                            <span
                              className="language-dot"
                              style={{
                                backgroundColor:
                                  LANGUAGE_COLORS[repo.language] || '#8b949e',
                              }}
                            ></span>
                            <span className="language-name">{repo.language}</span>
                          </div>
                        ) : (
                          <div className="repo-language">
                            <span className="language-dot generic"></span>
                            <span className="language-name">Plain text</span>
                          </div>
                        )}

                        {/* Stars */}
                        <div className="repo-stat" title={`${repo.stargazers_count} stargazers`}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                          </svg>
                          <span>{repo.stargazers_count.toLocaleString()}</span>
                        </div>

                        {/* Forks */}
                        <div className="repo-stat" title={`${repo.forks_count} forks`}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="6" y1="3" x2="6" y2="15"></line>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                          </svg>
                          <span>{repo.forks_count.toLocaleString()}</span>
                        </div>

                        {/* Updated Relative Time */}
                        <span className="repo-updated" title={new Date(repo.updated_at).toLocaleString()}>
                          {formatRelativeTime(repo.updated_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-repos-state">
                  <div className="empty-icon-box">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M8 15h8"></path>
                      <line x1="9" y1="9" x2="9.01" y2="9"></line>
                      <line x1="15" y1="9" x2="15.01" y2="9"></line>
                    </svg>
                  </div>
                  <h4>No repositories found</h4>
                  <p>
                    {repoQuery
                      ? `No repositories match "${repoQuery}". Try clearing your search filter.`
                      : 'This user does not have any public repositories available.'}
                  </p>
                  {repoQuery && (
                    <button
                      type="button"
                      className="clear-filter-btn"
                      onClick={() => setRepoQuery('')}
                    >
                      Clear Search Filter
                    </button>
                  )}
                </div>
              )}
            </section>
          </main>
        )}

        {/* Footer */}
        <footer className="app-footer">
          <p>
            Powered by the public{' '}
            <a href="https://docs.github.com/en/rest" target="_blank" rel="noopener noreferrer">
              GitHub REST API
            </a>
            . Real-time developer profiles and public repository stats.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
