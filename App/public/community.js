'use strict';

const bullionCommunity = {
  view: 'discover', author: null, page: 0, request: 0, loading: false,
  profile: null, moderator: false, account: null, discoverMetal: '', discoverType: '', myPostType: 'all', profilePostType: 'all'
};
const communityPageSize = 12;
const communityMetals = ['Gold','Silver','Platinum','Palladium','Copper'];
const communityAvatarMetals = ['gold','silver','platinum','palladium','copper'];
const communityPhotoTypes = ['Coin','Round','Bar','Display'];
const communityItemTypeLabel = type => type === 'Display' ? 'Collection display' : type;
const communityNode = id => document.getElementById(id);
const communityPhotoPath = post => post.status === 'approved' ? post.public_photo_path : post.photo_path;

function communityElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function communityButton(label, action, className = 'communitySecondary') {
  const button = communityElement('button', className, label);
  button.type = 'button';
  button.onclick = action;
  return button;
}

function communityOptions(label, className = 'communityPostOptions') {
  const options = communityElement('details', className);
  const toggle = communityElement('summary', '', '•••');
  toggle.setAttribute('aria-label', label);
  options.append(toggle);
  return options;
}

function communityReactionButton(path, count, action) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const button = communityButton('', action, 'communityReaction');
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS(svgNamespace, 'path');
  outline.setAttribute('d', path);
  icon.append(outline);
  button.append(icon, communityElement('span', '', String(count)));
  return button;
}

function openBullionNewsSection(section) {
  const community = section === 'community' || section === 'review';
  communityNode('communityPanel').hidden = !community;
  communityNode('communityMarketNews').hidden = community;
  communityNode('newsRefreshButton').hidden = community;
  communityNode('communityNewsTab').setAttribute('aria-pressed', !community);
  communityNode('communityGalleryTab').setAttribute('aria-pressed', community);
  if (community) void showBullionGallery(section === 'review' ? 'review' : 'discover');
  else {
    bullionCommunity.request++;
    bullionCommunity.loading = false;
    communityNode('communityFeed').replaceChildren();
    if (communityNode('newsScreen').classList.contains('show')) void loadMarketNews(false);
  }
}

async function loadCommunityReviewAlertPreference() {
  const row = communityNode('communityReviewAlertsRow');
  const toggle = communityNode('communityReviewAlertsToggle');
  const userId = currentUser?.id;
  if (!row || !toggle || !userId || toggle.disabled) return;
  try {
    const {data} = await communityData(supabaseClient.from('community_moderators')
      .select('review_alerts_since').eq('user_id', userId).maybeSingle());
    if (currentUser?.id !== userId || toggle.disabled) return;
    row.hidden = !data;
    toggle.classList.toggle('on', !!data?.review_alerts_since);
    toggle.setAttribute('aria-pressed', String(!!data?.review_alerts_since));
  } catch {
    if (currentUser?.id === userId) row.hidden = true;
  }
}

async function toggleCommunityReviewAlerts() {
  const row = communityNode('communityReviewAlertsRow');
  const toggle = communityNode('communityReviewAlertsToggle');
  const status = communityNode('notificationPrefsStatus');
  const userId = currentUser?.id;
  if (!userId || row.hidden || toggle.disabled) return;
  const enable = toggle.getAttribute('aria-pressed') !== 'true';
  toggle.disabled = true;
  try {
    await communityData(supabaseClient.from('community_moderators')
      .update({review_alerts_since:enable ? new Date().toISOString() : null})
      .eq('user_id', userId).select('user_id').single());
    if (currentUser?.id === userId) {
      toggle.classList.toggle('on', enable);
      toggle.setAttribute('aria-pressed', String(enable));
      status.textContent = enable ? 'Community review alerts enabled.' : 'Community review alerts disabled.';
    }
  } catch {
    if (currentUser?.id === userId) status.textContent = 'Could not save this setting. Please try again.';
  } finally {
    toggle.disabled = false;
    if (currentUser?.id !== userId) void loadCommunityReviewAlertPreference();
  }
}

async function openCommunityReviewFromAlert() {
  const userId = currentUser?.id;
  if (!userId) return;
  try {
    const {data} = await communityData(supabaseClient.from('community_moderators')
      .select('user_id').eq('user_id', userId).maybeSingle());
    if (data && currentUser?.id === userId) openNews('review');
  } catch (error) {
    console.warn('Could not open the Community review queue:', error);
  }
}

let communityNotificationListener;
async function connectCommunityNotificationRoute() {
  const plugin = nativeBenzaNotifications();
  if (!plugin?.consumeCommunityReviewTap) return;
  try {
    communityNotificationListener ??= plugin.addListener('communityReviewTap', () => void consumeTap());
    await communityNotificationListener;
    await consumeTap();
  } catch (error) {
    communityNotificationListener = null;
    console.warn('Could not connect Community notification routing:', error);
  }
  async function consumeTap() {
    if (!currentUser) return;
    try {
      const {pending} = await plugin.consumeCommunityReviewTap();
      if (pending) await openCommunityReviewFromAlert();
    } catch (error) {
      console.warn('Could not read Community notification route:', error);
    }
  }
}

function communityStatus(message) {
  communityNode('communityStatus').textContent = message;
}

async function communityData(query) {
  const {data, error, count} = await query;
  if (error) throw error;
  return {data, count};
}

function communitySignIn(reason) {
  return !!currentUser || requestAccountAccess(reason, 'community');
}

function communityCurrent(request, userId) {
  return bullionCommunity.request === request && (currentUser?.id || null) === userId;
}

async function showBullionGallery(view, author = null) {
  if ((view === 'mine' || view === 'following' || view === 'blocked') && !communitySignIn('use Bullion Community')) return;
  if (view === 'profile' && (bullionCommunity.view !== view || bullionCommunity.author !== author)) {
    bullionCommunity.profilePostType = 'all';
  }
  bullionCommunity.view = view;
  bullionCommunity.author = author;
  bullionCommunity.page = 0;
  for (const button of document.querySelectorAll('[data-community-view]')) {
    button.setAttribute('aria-pressed', button.dataset.communityView === view);
  }
  await loadBullionGallery();
}

function updateCommunityDiscoverFilters() {
  const {view, discoverMetal, discoverType} = bullionCommunity;
  const selection = [discoverMetal, communityItemTypeLabel(discoverType)].filter(Boolean).join(' · ');
  communityNode('communityDiscoverFilters').hidden = view !== 'discover';
  communityNode('communityDiscoverSelection').textContent = selection;
  communityNode('communityClearFilters').hidden = !selection;
}

function openCommunityDiscoverFilters() {
  const metal = communitySelect(['All metals', ...communityMetals]);
  metal.options[0].value = '';
  metal.value = bullionCommunity.discoverMetal;
  const type = communitySelect(['All types', ...communityPhotoTypes, 'Discussion'], communityItemTypeLabel);
  type.options[0].value = '';
  type.value = bullionCommunity.discoverType;
  function syncMetalFilter() {
    metal.disabled = type.value === 'Discussion';
  }
  type.addEventListener('change', syncMetalFilter);
  syncMetalFilter();
  openCommunityDialog('Filter Discover', [communityFormField('Metal', metal), communityFormField('Item type', type)], 'Apply filters', () => {
    bullionCommunity.discoverMetal = metal.disabled ? '' : metal.value;
    bullionCommunity.discoverType = type.value;
  });
}

function clearCommunityDiscoverFilters() {
  bullionCommunity.discoverMetal = '';
  bullionCommunity.discoverType = '';
  void loadBullionGallery();
}

function filterCommunityBlockedCollectors(query, column, blockedIds) {
  return blockedIds.length ? query.not(column, 'in', '(' + blockedIds.join(',') + ')') : query;
}

function renderCommunitySearch(userId, blockedIds) {
  const panel = communityElement('section', 'communityPeopleSearch');
  const form = communityElement('form', 'communityPeopleForm');
  form.setAttribute('role', 'search');
  form.setAttribute('aria-label', 'Find collectors');
  const field = communityElement('input');
  field.type = 'search';
  field.placeholder = 'Search by display name';
  field.setAttribute('aria-label', 'Search by display name');
  field.maxLength = 32;
  field.required = true;
  const submit = communityElement('button', 'communityPrimary', 'Search');
  submit.type = 'submit';
  const status = communityElement('p', 'communitySearchStatus');
  status.setAttribute('role', 'status');
  const results = communityElement('ul', 'communityPeopleResults');
  form.append(field, submit);
  panel.append(communityElement('h3', '', 'Find collectors'), form, status, results);
  form.onsubmit = async event => {
    event.preventDefault();
    const term = field.value.trim();
    if (submit.disabled) return;
    results.replaceChildren();
    if (term.length < 2) {
      status.textContent = 'Enter at least two characters.';
      return;
    }
    submit.disabled = true;
    status.textContent = 'Searching…';
    try {
      const literal = term.replace(/[\\%_]/g, character => '\\' + character);
      const query = supabaseClient.from('community_profiles')
        .select('id,display_name,avatar_style,avatar_initials').ilike('display_name', '%' + literal + '%');
      const {data} = await communityData(filterCommunityBlockedCollectors(query, 'id', blockedIds)
        .order('display_name').order('id').limit(21));
      if (!panel.isConnected || (currentUser?.id || null) !== userId) return;
      for (const profile of data.slice(0, 20)) {
        const row = communityElement('li');
        const action = communityButton('', () => showBullionGallery('profile', profile.id), 'communityPersonResult');
        const avatar = communityAvatar(profile);
        action.append(avatar, communityElement('strong', '', profile.display_name));
        row.append(action);
        results.append(row);
      }
      status.textContent = data.length > 20 ? 'Showing 20 matches. Enter more of the name to narrow your search.'
        : data.length ? '' : 'No collectors found.';
    } catch {
      if (panel.isConnected && (currentUser?.id || null) === userId) status.textContent = 'Couldn’t search for collectors. Try again.';
    } finally {
      submit.disabled = false;
    }
  };
  return panel;
}

async function loadMoreBullionPosts() {
  if (!bullionCommunity.loading) await loadBullionGallery(true);
}

async function loadBullionGallery(append = false, filterOnly = false) {
  const request = ++bullionCommunity.request;
  const userId = currentUser?.id || null;
  const {view, author, page, discoverMetal, discoverType} = bullionCommunity;
  const postType = view === 'mine' ? bullionCommunity.myPostType : bullionCommunity.profilePostType;
  updateCommunityDiscoverFilters();
  communityNode('communityBlockedTab').hidden = !userId;
  const feed = communityNode('communityFeed');
  const more = communityNode('communityMore');
  bullionCommunity.loading = true;
  if (!append && !filterOnly) feed.replaceChildren();
  more.hidden = true;
  if (!filterOnly) communityStatus('Loading community…');

  try {
    if (!supabaseClient) throw new Error('Community is unavailable.');
    if (view === 'blocked') {
      const {data} = await communityData(supabaseClient.rpc('benza_community_blocked_collectors'));
      if (!communityCurrent(request, userId)) return;
      communityStatus(data.length ? '' : 'You haven’t blocked any collectors.');
      const list = communityElement('section', 'communityCommentList');
      list.append(communityElement('h3', '', 'Blocked collectors'));
      for (const collector of data) {
        const row = communityElement('div', 'communityBlockedRow');
        const button = communityButton('Unblock', () => unblockBullionCollector(collector));
        button.setAttribute('aria-label', 'Unblock ' + collector.display_name);
        row.append(communityElement('strong', '', collector.display_name), button);
        list.append(row);
      }
      if (data.length) feed.append(list);
      return;
    }
    const [profile, membership] = userId ? await Promise.all([
      communityData(supabaseClient.from('community_profiles').select('id,display_name').eq('id', userId).maybeSingle()),
      communityData(supabaseClient.from('community_moderators').select('user_id').eq('user_id', userId).maybeSingle())
    ]) : [{data:null}, {data:null}];
    if (!communityCurrent(request, userId)) return;
    bullionCommunity.account = userId;
    bullionCommunity.profile = profile.data;
    bullionCommunity.moderator = !!membership.data;
    communityNode('communityReviewTab').hidden = !bullionCommunity.moderator;
    if (view === 'review' && !bullionCommunity.moderator) return;

    // Moderators still need access to blocked content in the review queue.
    const blocked = bullionCommunity.moderator && view !== 'review'
      ? await communityData(supabaseClient.from('community_blocks').select('blocked_id').eq('blocker_id', userId))
      : {data:[]};
    if (!communityCurrent(request, userId)) return;
    const blockedIds = blocked.data.map(row => row.blocked_id);
    if (view === 'people') {
      communityStatus('');
      feed.append(renderCommunitySearch(userId, blockedIds));
      return;
    }
    if (view === 'profile' && blockedIds.includes(author)) {
      communityStatus('This collector profile is unavailable.');
      return;
    }

    let reports = [];
    let commentFlags = [];
    let query = supabaseClient.from('community_posts')
      .select('id,author_id,metal,item_type,caption,photo_path,public_photo_path,status,created_at,published_at,review_reason,community_profiles(display_name,avatar_style,avatar_initials),community_likes(count),community_comments(count)');
    if (view === 'mine') {
      query = query.eq('author_id', userId);
    } else if (view === 'review') {
      const [result, flags] = await Promise.all([
        communityData(supabaseClient.from('community_reports')
          .select('post_id,reason,community_posts!inner(status)').is('resolved_at', null)
          .eq('community_posts.status', 'approved').limit(100)),
        !append ? communityData(supabaseClient.from('community_comment_flags')
          .select('id,comment_id,reason,community_comments!inner(id,body,community_profiles(display_name,avatar_style,avatar_initials),community_posts!inner(caption,status))')
          .is('resolved_at', null).eq('community_comments.community_posts.status', 'approved')
          .order('created_at').limit(100)) : {data:[]}
      ]);
      commentFlags = flags.data;
      reports = result.data || [];
      const reportedIds = [...new Set(reports.map(report => report.post_id))];
      query = reportedIds.length
        ? query.or('status.eq.pending,id.in.(' + reportedIds.join(',') + ')')
        : query.eq('status', 'pending');
    } else {
      query = query.eq('status', 'approved');
      if (view === 'discover') {
        if (discoverMetal) query = query.eq('metal', discoverMetal.toLowerCase());
        if (discoverType) query = query.eq('item_type', discoverType);
      }
      if (view === 'profile') query = query.eq('author_id', author);
      if (view === 'following') {
        const result = await communityData(supabaseClient.from('community_follows').select('followed_id').eq('follower_id', userId));
        const followed = result.data.map(row => row.followed_id);
        if (!followed.length) {
          if (communityCurrent(request, userId)) communityStatus('Follow a collector from Discover to see their posts here.');
          return;
        }
        query = query.in('author_id', followed);
      }
    }

    if (view === 'mine' || view === 'profile') {
      if (postType === 'discussions') query = query.eq('item_type', 'Discussion');
      if (postType === 'photos') query = query.in('item_type', communityPhotoTypes);
    }
    query = filterCommunityBlockedCollectors(query, 'author_id', blockedIds);
    query = filterCommunityBlockedCollectors(query, 'community_comments.author_id', blockedIds);
    const dateColumn = view === 'mine' || view === 'review' ? 'created_at' : 'published_at';
    const offset = append ? page * communityPageSize : 0;
    const {data: results} = await communityData(query.order(dateColumn, {ascending: view === 'review'})
      .order('id').range(offset, offset + communityPageSize));
    const posts = results.slice(0, communityPageSize);
    const photoPosts = posts.filter(post => post.item_type !== 'Discussion');
    const authors = [...new Set(posts.map(post => post.author_id))];
    if (author && !authors.includes(author)) authors.push(author);
    const [likeRows, followRows, photos, profileCard] = await Promise.all([
      userId && posts.length ? communityData(supabaseClient.from('community_likes').select('post_id')
        .eq('user_id', userId).in('post_id', posts.map(post => post.id))) : {data:[]},
      userId && authors.length ? communityData(supabaseClient.from('community_follows').select('followed_id')
        .eq('follower_id', userId).in('followed_id', authors)) : {data:[]},
      photoPosts.length ? supabaseClient.storage.from('bullion-community').createSignedUrls(photoPosts.map(communityPhotoPath), 120) : {data:[]},
      !append && !filterOnly && (view === 'profile' || view === 'mine')
        ? getBullionProfile(view === 'mine' ? userId : author)
        : null
    ]);
    if (!communityCurrent(request, userId)) return;

    if (filterOnly) {
      feed.querySelectorAll('.communityPost,.communityMyPostsEmpty,.communityFilterRetry').forEach(node => node.remove());
    }
    if (commentFlags.length) feed.append(renderFlaggedBullionComments(commentFlags));
    if (profileCard) {
      if (view === 'profile' && author !== userId) {
        const selected = followRows.data.some(row => row.followed_id === author);
        const follow = communityButton(selected ? 'Unfollow' : 'Follow', () =>
          updateBullionFollow({author_id:author}, follow.getAttribute('aria-pressed') === 'true', follow), 'communityRowFollow');
        follow.dataset.followAuthor = author;
        follow.dataset.activeLabel = 'Unfollow';
        follow.setAttribute('aria-pressed', selected);
        profileCard.querySelector('.communityProfileHead').append(follow,
          communityButton('Block collector', () => blockBullionCollector(author), 'communityProfileAction'));
      }
      feed.append(profileCard);
    }
    const showProfilePosts = view === 'mine' || (view === 'profile' && (profileCard || filterOnly));
    if (!append && showProfilePosts) {
      if (!filterOnly) feed.append(renderCommunityProfilePostFilters(view, postType));
      if (!posts.length) {
        const emptyMessages = view === 'mine' ? {
          all:'You haven’t submitted a post yet.',
          discussions:'You haven’t submitted a discussion yet.',
          photos:'You haven’t submitted a photo post yet.'
        } : {
          all:'No published posts from this collector yet.',
          discussions:'No published discussions from this collector yet.',
          photos:'No published photo posts from this collector yet.'
        };
        const empty = communityElement('p', 'communityStatus communityMyPostsEmpty', emptyMessages[postType]);
        empty.setAttribute('role', 'status');
        feed.append(empty);
      }
    }
    const liked = new Set(likeRows.data.map(row => row.post_id));
    const followed = new Set(followRows.data.map(row => row.followed_id));
    const signed = new Map((photos.data || []).map(photo => [photo.path, photo.signedUrl]));
    for (const post of posts) {
      feed.append(renderBullionPost(post, signed.get(communityPhotoPath(post)), liked, followed, reports, blockedIds));
    }
    communityStatus(posts.length || commentFlags.length || append || showProfilePosts ? '' : {
      discover:discoverMetal || discoverType ? 'No posts match these filters.' : 'No published posts yet. Start a bullion discussion or share a photo.',
      following:'No approved posts from collectors you follow yet.',
      review:'The review queue is clear.',
      profile:'This collector profile is unavailable.'
    }[view]);
    bullionCommunity.page = offset / communityPageSize + 1;
    more.hidden = results.length <= communityPageSize;
  } catch (error) {
    if (communityCurrent(request, userId)) {
      communityStatus('Couldn’t load the gallery. Try again.');
      if (append) more.hidden = false;
      else if (filterOnly) {
        feed.querySelector('.communityFilterRetry')?.remove();
        feed.append(communityButton('Retry filter', () => loadBullionGallery(false, true), 'communityFilterRetry'));
      } else feed.append(communityButton('Try again', () => loadBullionGallery()));
    }
    console.warn('Bullion Community load failed:', error);
  } finally {
    if (request === bullionCommunity.request) bullionCommunity.loading = false;
  }
}

function communityInitials(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(word => Array.from(word)[0].toLocaleUpperCase()).join('') || '•';
}

function renderCommunityProfilePostFilters(view, selected) {
  const ownProfile = view === 'mine';
  const filterKey = ownProfile ? 'myPostType' : 'profilePostType';
  const section = communityElement('section', 'communityMyPostsHeader');
  const heading = communityElement('h3', 'communityProfilePostsHeading', ownProfile ? 'My posts' : 'Posts');
  const filters = communityElement('div', 'communityMyPostFilters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', ownProfile ? 'Filter my posts' : 'Filter posts');
  for (const [type, label] of [['all','All'], ['discussions','Discussions'], ['photos','Photos']]) {
    const button = communityButton(label, () => {
      if (bullionCommunity.view !== view || bullionCommunity[filterKey] === type) return;
      bullionCommunity[filterKey] = type;
      for (const option of filters.children) option.setAttribute('aria-pressed', option === button);
      void loadBullionGallery(false, true);
    }, 'communityMyPostFilter');
    button.setAttribute('aria-pressed', String(selected === type));
    filters.append(button);
  }
  section.append(heading, filters);
  return section;
}

async function getBullionProfile(authorId) {
  const isOwner = currentUser?.id === authorId;
  const [profile, posts, followers, following, likes] = await Promise.all([
    communityData(supabaseClient.from('community_profiles').select('display_name,bio,avatar_style,avatar_initials').eq('id', authorId).maybeSingle()),
    communityData(supabaseClient.from('community_posts').select('id', {count:'exact', head:true})
      .eq('author_id', authorId).eq('status', 'approved')),
    communityData(supabaseClient.from('community_follows').select('follower_id', {count:'exact', head:true}).eq('followed_id', authorId)),
    communityData(supabaseClient.from('community_follows').select('followed_id', {count:'exact', head:true}).eq('follower_id', authorId)),
    communityData(supabaseClient.from('community_likes').select('post_id,community_posts!inner(author_id,status)', {count:'exact', head:true})
      .eq('community_posts.author_id', authorId).eq('community_posts.status', 'approved'))
  ]);
  if (!profile.data && !isOwner) return null;
  const card = communityElement('section', 'communityProfile');
  const header = communityElement('div', 'communityProfileHead');
  const identity = communityElement('div', 'communityProfileIdentity');
  const name = profile.data?.display_name || 'Your collector profile';
  const avatar = communityAvatar(profile.data);
  identity.append(avatar, communityElement('h3', '', name));
  header.append(identity);
  if (isOwner) {
    const edit = communityButton('Edit', () => editBullionProfile(authorId, profile.data), 'communityProfileAction');
    edit.setAttribute('aria-label', 'Edit profile');
    const bell = communityReactionButton('M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 20a2 2 0 0 0 4 0', '', () => openCommunityList('Activity'));
    bell.classList.add('communityBell');
    bell.dataset.activityOwner = authorId;
    bell.lastChild.className = 'communityUnread';
    bell.lastChild.hidden = true;
    void refreshCommunityBadge(bell);
    bell.setAttribute('aria-label', 'Community activity');
    const actions = communityElement('div', 'communityProfileActions');
    actions.append(bell, edit);
    header.append(actions);
  }
  const stats = communityElement('dl', 'communityProfileStats');
  for (const [label, count] of [
    ['Published posts', posts.count], ['Followers', followers.count],
    ['Following', following.count], ['Likes received', likes.count]
  ]) {
    const stat = communityElement('div');
    const value = communityElement('dd', '', (count ?? 0).toLocaleString());
    if (label === 'Likes received') {
      value.dataset.communityLikesFor = authorId;
      value.dataset.count = String(count ?? 0);
    }
    stat.append(communityElement('dt', '', label), value);
    if (isOwner && ['Followers','Following'].includes(label)) {
      const button = communityButton('', () => openCommunityList(label), 'communityStatLink');
      button.setAttribute('aria-label', label + ', ' + (count ?? 0));
      if (label === 'Following') button.dataset.followingFor = authorId;
      value.replaceChildren(button);
      button.textContent = (count ?? 0).toLocaleString();
    }
    if (label === 'Followers') value.dataset.followersFor = authorId;
    stats.append(stat);
  }
  card.append(header);
  if (profile.data?.bio) card.append(communityElement('p', 'communityBio', profile.data.bio));
  card.append(stats);
  return card;
}

function communityAvatar(profile, avatar = communityElement('span', 'communityAvatar')) {
  avatar.setAttribute('aria-hidden', 'true');
  const metal = profile?.avatar_style;
  if (communityAvatarMetals.includes(metal)) avatar.dataset.metal = metal;
  else delete avatar.dataset.metal;
  avatar.textContent = profile?.avatar_initials || communityInitials(profile?.display_name || '');
  return avatar;
}

function editBullionProfile(authorId, profile) {
  if (currentUser?.id !== authorId) return;
  const name = communityElement('input');
  name.value = profile?.display_name || '';
  name.required = true;
  name.minLength = 2;
  name.maxLength = 32;
  name.pattern = '.*\\S.*\\S.*';
  const initials = communityElement('input');
  initials.value = profile?.avatar_initials || '';
  initials.maxLength = 3;
  initials.pattern = '[A-Za-z0-9]{1,3}';
  initials.placeholder = 'Auto';
  const initialsField = communityFormField('Custom initials (optional)', initials);
  const avatarPicker = communityElement('div', 'communityAvatarPicker');
  avatarPicker.setAttribute('role', 'group');
  avatarPicker.setAttribute('aria-label', 'Avatar finish');
  let avatarStyle = profile?.avatar_style || 'initials';
  const bio = communityElement('textarea');
  bio.value = profile?.bio || '';
  bio.maxLength = 160;
  bio.rows = 3;
  bio.placeholder = 'What do you enjoy collecting?';
  name.autocomplete = 'nickname';
  name.placeholder = 'Your collector name';
  const preview = communityElement('div', 'communityProfilePreview');
  const avatar = communityElement('span', 'communityAvatar');
  avatar.setAttribute('aria-hidden', 'true');
  const identity = communityElement('div', 'communityPreviewIdentity');
  const previewName = communityElement('strong');
  const previewBio = communityElement('p');
  const bioCount = communityElement('span', 'communityBioCount');
  identity.append(previewName, previewBio);
  preview.append(avatar, identity);
  const bioField = communityFormField('Bio (optional)', bio);
  bioCount.id = 'communityProfileBioCount';
  bio.setAttribute('aria-describedby', bioCount.id);
  bioField.append(bioCount);
  function updatePreview() {
    const displayName = name.value.trim();
    communityAvatar({display_name:displayName, avatar_style:avatarStyle, avatar_initials:initials.value.toUpperCase()}, avatar);
    for (const choice of avatarPicker.children) choice.setAttribute('aria-pressed', String(choice.dataset.style === avatarStyle));
    previewName.textContent = displayName || 'Your collector name';
    previewBio.textContent = bio.value.trim();
    previewBio.hidden = !previewBio.textContent;
    bioCount.textContent = bio.value.length + ' / ' + bio.maxLength;
  }
  for (const style of ['initials', ...communityAvatarMetals]) {
    const label = style === 'initials' ? 'Classic' : style[0].toUpperCase() + style.slice(1);
    const choice = communityButton('', () => { avatarStyle = style; updatePreview(); }, 'communityAvatarChoice');
    choice.dataset.style = style;
    choice.append(communityAvatar({display_name:'Aa', avatar_style:style, avatar_initials:'Aa'}), communityElement('span', '', label));
    avatarPicker.append(choice);
  }
  initials.addEventListener('input', () => {
    initials.value = initials.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    updatePreview();
  });
  name.addEventListener('input', updatePreview);
  bio.addEventListener('input', updatePreview);
  updatePreview();
  const fields = [
    communityElement('p', 'communityProfileHint', 'Choose a unique display name so other collectors can find you.'),
    preview, communityFormField('Display name', name), initialsField,
    communityElement('p', 'communityAvatarFinishLabel', 'Avatar finish'), avatarPicker, bioField
  ];
  openCommunityDialog('Edit community profile', fields, 'Save changes', async () => {
    const values = {display_name:name.value.trim(), bio:bio.value.trim(), avatar_style:avatarStyle, avatar_initials:initials.value.toUpperCase()};
    const profiles = supabaseClient.from('community_profiles');
    const write = profile ? profiles.update(values).eq('id', authorId) : profiles.insert({id:authorId, ...values});
    await communityData(write.select('id').single());
    return 'Community profile saved.';
  });
}

function renderBullionPost(post, photoUrl, liked, followed, reports, blockedIds) {
  const article = communityElement('article', 'communityPost');
  const heading = communityElement('div', 'communityPostHead');
  const name = post.community_profiles?.display_name || 'Collector';
  const identity = communityElement('div', 'communityPostIdentity');
  const avatar = communityAvatar(post.community_profiles || {display_name:name});
  const author = communityElement('div', 'communityPostByline');
  author.append(communityButton(name, () => showBullionGallery('profile', post.author_id), 'communityAuthor'));
  identity.append(avatar, author);
  const discussion = post.item_type === 'Discussion';
  article.classList.toggle('communityDiscussion', discussion);
  const label = discussion ? 'Discussion' : post.metal[0].toUpperCase() + post.metal.slice(1) + ' · ' + communityItemTypeLabel(post.item_type);
  const category = communityElement('span', 'communityPostCategory', label);
  if (!discussion) category.dataset.metal = post.metal;
  const metadata = communityElement('div', 'communityPostMetadata');
  metadata.append(category);
  const timestamp = post.published_at || post.created_at;
  const date = new Date(timestamp);
  if (timestamp && Number.isFinite(date.getTime())) {
    const day = date.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
    const clock = date.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
    const time = communityElement('time', '', day + ' · ' + clock);
    time.dateTime = timestamp;
    metadata.append(time);
  }
  heading.append(identity, metadata);
  article.append(heading);

  if (photoUrl) {
    const photo = communityElement('img', 'communityPhoto');
    photo.src = photoUrl;
    photo.alt = post.metal + ' ' + communityItemTypeLabel(post.item_type).toLowerCase() + ' shared by ' + name;
    photo.referrerPolicy = 'no-referrer';
    photo.decoding = 'async';
    const preview = communityButton('', () => openCommunityPhoto(photo), 'communityPhotoButton');
    preview.setAttribute('aria-label', 'Enlarge photo of ' + photo.alt);
    preview.append(photo);
    article.append(preview);
  } else if (post.item_type !== 'Discussion' && (post.status === 'pending' || post.status === 'approved')) {
    article.append(communityElement('p', 'communityPhotoStatus', 'Photo unavailable'));
  }
  const body = communityElement('div', 'communityPostBody');
  const actions = communityElement('div', 'communityPostActions');
  const options = communityOptions('Post options');
  let comments;
  body.append(communityElement('p', 'communityPostCaption', post.caption));
  if (post.status !== 'approved') body.append(communityElement('p', 'communityBadge',
    post.status === 'pending' ? 'Awaiting review' : post.status === 'declined' ? 'Declined' : 'Removed'));
  if (post.status === 'declined' && post.review_reason) body.append(communityElement('p', 'communityBadge', post.review_reason));
  if (post.status === 'approved') {
    const selected = liked.has(post.id);
    const count = post.community_likes?.[0]?.count || 0;
    const heart = communityReactionButton('M20.8 4.6a5.2 5.2 0 0 0-7.4 0L12 6l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4l1.4 1.4L12 21l7.4-7.6 1.4-1.4a5.2 5.2 0 0 0 0-7.4Z',
      count, () => toggleBullionLike(post, heart));
    heart.setAttribute('aria-pressed', selected);
    heart.setAttribute('aria-label', selected ? 'Unlike post' : 'Like post');
    comments = renderBullionComments(post, post.community_comments?.[0]?.count || 0, blockedIds);
    actions.append(heart, comments.toggle);
    if (post.author_id !== currentUser?.id) {
      const follows = followed.has(post.author_id);
      const follow = communityButton(follows ? 'Following' : 'Follow',
        () => updateBullionFollow(post, follow.getAttribute('aria-pressed') === 'true', follow), 'communityRowFollow');
      follow.dataset.followAuthor = post.author_id;
      follow.setAttribute('aria-pressed', follows);
      identity.append(follow);
      options.append(communityButton('Report', () => reportBullionPost(post)),
        communityButton('Block', () => blockBullionCollector(post.author_id)));
    }
  }
  if (post.author_id === currentUser?.id) options.append(communityButton('Delete my post', () => deleteBullionPost(post)));
  if (post.status === 'approved' && bullionCommunity.moderator) {
    options.append(communityButton('Remove as moderator', () => moderateBullionPost(post, 'removed')));
  }
  if (bullionCommunity.view === 'review' && bullionCommunity.moderator) {
    if (post.status === 'pending') {
      const approve = communityButton('Approve', () => moderateBullionPost(post, 'approved'), 'communityPrimary');
      approve.disabled = post.item_type !== 'Discussion' && !photoUrl;
      actions.append(approve, communityButton('Decline', () => moderateBullionPost(post, 'declined')));
    }
    const reasons = reports.filter(report => report.post_id === post.id).map(report => report.reason);
    if (reasons.length) {
      body.append(communityElement('p', 'communityBadge', 'Reports: ' + reasons.join(', ')));
      actions.append(communityButton('Resolve and keep post', () => resolveBullionReports(post.id)));
    }
  }
  if (options.childElementCount > 1) actions.append(options);
  body.append(actions);
  if (comments) body.append(comments.thread);
  article.append(body);
  return article;
}

function renderBullionComments(post, count, blockedIds) {
  const thread = communityElement('section', 'communityComments');
  thread.id = 'communityComments-' + post.id;
  thread.hidden = true;
  const toggle = communityReactionButton('M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.7 8.7 0 0 1-4.1-1L3 21l1.8-5.1A8.5 8.5 0 1 1 21 11.5Z', count, () => {
    thread.hidden = !thread.hidden;
    toggle.setAttribute('aria-expanded', String(!thread.hidden));
    if (!thread.hidden) void loadComments();
  });
  toggle.setAttribute('aria-controls', thread.id);
  toggle.setAttribute('aria-expanded', 'false');
  function updateCommentCount() {
    toggle.lastElementChild.textContent = String(count);
    toggle.setAttribute('aria-label', count === 1 ? '1 comment' : count + ' comments');
  }
  updateCommentCount();
  const list = communityElement('div', 'communityCommentList');
  const status = communityElement('p', 'communityCommentStatus');
  status.setAttribute('role', 'status');
  const previewSize = 3;
  let limit = previewSize;
  let request = 0;

  async function loadComments() {
    const version = ++request;
    const userId = currentUser?.id;
    status.textContent = 'Loading comments…';
    try {
      const query = supabaseClient.from('community_comments')
        .select('id,author_id,body,community_profiles(display_name,avatar_style,avatar_initials)')
        .eq('post_id', post.id);
      const {data} = await communityData(filterCommunityBlockedCollectors(query, 'author_id', blockedIds)
        .order('created_at', {ascending:false})
        .order('id', {ascending:false}).limit(limit + 1));
      if (version !== request || currentUser?.id !== userId) return;
      list.replaceChildren(...data.slice(0, limit).map(comment => renderBullionComment(comment)));
      if (data.length > limit) list.append(communityButton('Show older comments', () => {
        limit += previewSize;
        void loadComments();
      }, 'communityMoreComments'));
      status.textContent = data.length ? '' : 'No comments yet.';
    } catch {
      if (version === request) status.textContent = 'Couldn’t load comments. Reopen the thread to try again.';
    }
  }

  thread.append(list, status);
  if (!currentUser || !bullionCommunity.profile) {
    thread.append(communityButton(currentUser ? 'Set up your profile to comment' : 'Sign in to comment', () => {
      if (communitySignIn('comment on a post')) editBullionProfile(currentUser.id, null);
    }));
    return {thread, toggle};
  }

  const form = communityElement('form', 'communityCommentForm');
  const field = communityElement('textarea');
  field.rows = 1;
  field.maxLength = 500;
  field.required = true;
  field.placeholder = 'Add a comment…';
  field.setAttribute('aria-label', 'Add a comment');
  const submit = communityElement('button', 'communityPrimary', 'Post');
  submit.type = 'submit';
  submit.setAttribute('aria-label', 'Post comment');
  const feedback = communityElement('p', 'communityCommentStatus');
  feedback.setAttribute('role', 'status');
  form.append(field, submit, feedback);
  form.onsubmit = async event => {
    event.preventDefault();
    const userId = currentUser?.id;
    const body = field.value.trim();
    if (!userId || !body || submit.disabled) return;
    submit.disabled = true;
    feedback.textContent = '';
    try {
      await communityData(supabaseClient.from('community_comments')
        .insert({post_id:post.id, author_id:userId, body}));
      field.value = '';
      count++;
      updateCommentCount();
      void loadComments();
    } catch (error) {
      feedback.textContent = error.message?.includes('community_comment_content_allowed')
        ? 'Edit your comment to remove the abusive or explicit language.'
        : error.code === '23514' ? 'Leave links and email addresses out of comments.' : 'Couldn’t post your comment. Try again.';
    } finally {
      submit.disabled = false;
    }
  };
  thread.append(form);
  return {thread, toggle};
}

function renderBullionComment(comment) {
  const item = communityElement('article', 'communityComment communityCommentRow');
  const heading = communityElement('div', 'communityCommentText');
  const byline = communityElement('div', 'communityCommentByline');
  byline.append(communityAvatar(comment.community_profiles), communityElement('strong', '', comment.community_profiles?.display_name || 'Collector'));
  heading.append(byline);
  if (currentUser) {
    const options = communityOptions('Comment options', 'communityCommentOptions');
    options.append(communityButton('Flag comment', () => {
      options.open = false;
      flagBullionComment(comment);
    }));
    if (comment.author_id !== currentUser.id) {
      options.append(communityButton('Block collector', () => {
        options.open = false;
        blockBullionCollector(comment.author_id);
      }));
    }
    if (comment.author_id === currentUser.id || bullionCommunity.moderator) {
      options.append(communityButton('Remove comment', () => {
        options.open = false;
        removeBullionComment(comment);
      }));
    }
    item.append(options);
  }
  heading.append(communityElement('p', '', comment.body));
  item.prepend(heading);
  return item;
}

function flagBullionComment(comment) {
  if (!communitySignIn('flag a comment')) return;
  const reason = communitySelect(['Off topic','Privacy concern','Spam or promotion','Inappropriate content']);
  openCommunityDialog('Flag this comment', [communityFormField('Reason', reason)], 'Send flag', async () => {
    const {error} = await supabaseClient.from('community_comment_flags')
      .insert({comment_id:comment.id, reporter_id:currentUser.id, reason:reason.value});
    if (error?.code === '23505') return 'You already flagged this comment.';
    if (error) throw error;
    return 'Comment flagged for a moderator.';
  });
}

function removeBullionComment(comment) {
  openCommunityDialog('Remove this comment?', [], 'Remove comment', async () => {
    await communityData(supabaseClient.from('community_comments').delete().eq('id', comment.id).select('id').single());
    return 'Comment removed.';
  });
}

function renderFlaggedBullionComments(flags) {
  const section = communityElement('section', 'communityCommentList');
  section.append(communityElement('h3', '', 'Flagged comments'));
  const comments = new Map();
  for (const flag of flags) {
    if (!flag.community_comments) continue;
    if (!comments.has(flag.comment_id)) comments.set(flag.comment_id, {comment:flag.community_comments, reasons:new Set(), flagIds:[]});
    const group = comments.get(flag.comment_id);
    group.reasons.add(flag.reason);
    group.flagIds.push(flag.id);
  }
  for (const {comment, reasons, flagIds} of comments.values()) {
    const card = communityElement('article', 'communityComment');
    card.append(communityElement('strong', '', comment.community_profiles?.display_name || 'Collector'),
      communityElement('p', '', comment.body),
      communityElement('p', 'communityBadge', 'On post “' + comment.community_posts.caption + '”'),
      communityElement('p', 'communityBadge', Array.from(reasons).join(' · ')));
    const actions = communityElement('div', 'communityPostActions');
    actions.append(communityButton('Remove comment', () => removeBullionComment(comment)),
      communityButton('Dismiss flags', () => {
        openCommunityDialog('Dismiss flags for this comment?', [], 'Dismiss flags', async () => {
          await communityData(supabaseClient.from('community_comment_flags')
            .update({resolved_at:new Date().toISOString()}).in('id', flagIds).is('resolved_at', null));
          return 'Flags dismissed.';
        });
      }));
    card.append(actions);
    section.append(card);
  }
  return section;
}

async function toggleBullionLike(post, button) {
  if (button.disabled || !communitySignIn('like bullion posts')) return;
  const userId = currentUser.id;
  const wasLiked = button.getAttribute('aria-pressed') === 'true';
  const countLabel = button.lastElementChild;
  const previousCount = Number(countLabel.textContent);
  const delta = wasLiked ? -1 : 1;
  function showLike(liked, count) {
    button.setAttribute('aria-pressed', String(liked));
    button.setAttribute('aria-label', liked ? 'Unlike post' : 'Like post');
    countLabel.textContent = String(Math.max(0, count));
  }

  button.disabled = true;
  showLike(!wasLiked, previousCount + delta);
  try {
    const target = supabaseClient.from('community_likes');
    const keys = {user_id:userId, post_id:post.id};
    await communityData(wasLiked ? target.delete().match(keys) : target.insert(keys));
    if (currentUser?.id === userId && button.isConnected) {
      const total = communityNode('communityFeed').querySelector('[data-community-likes-for]');
      if (total?.dataset.communityLikesFor === post.author_id) {
        const count = Math.max(0, Number(total.dataset.count) + delta);
        total.dataset.count = String(count);
        total.textContent = count.toLocaleString();
      }
    }
  } catch {
    showLike(wasLiked, previousCount);
    if (currentUser?.id === userId && button.isConnected) communityStatus('Couldn’t save your like. Try again.');
  } finally {
    button.disabled = false;
  }
}

async function updateBullionFollow(post, selected, button) {
  if (!communitySignIn('follow collectors') || button.disabled) return;
  const userId = currentUser.id;
  const keys = {follower_id:userId, followed_id:post.author_id};
  const controls = () => document.querySelectorAll('[data-follow-author="' + post.author_id + '"]');
  function paint(active, busy) {
    for (const control of controls()) {
      control.textContent = active ? (control.dataset.activeLabel || 'Following') : (control.dataset.inactiveLabel || 'Follow');
      control.setAttribute('aria-pressed', active);
      control.disabled = busy;
    }
  }
  paint(!selected, true);
  try {
    const target = supabaseClient.from('community_follows');
    await communityData(selected ? target.delete().match(keys) : target.insert(keys));
    if (currentUser?.id !== userId) return;
    paint(!selected, false);
    const ownCount = document.querySelector('[data-following-for="' + userId + '"]');
    if (ownCount) {
      const next = Math.max(0, Number(ownCount.textContent.replace(/[^0-9]/g,'')) + (selected ? -1 : 1));
      ownCount.textContent = next.toLocaleString();
      ownCount.setAttribute('aria-label', 'Following, ' + next);
    }
    const count = document.querySelector('[data-followers-for="' + post.author_id + '"]');
    if (count) count.textContent = Math.max(0, Number(count.textContent.replace(/[^0-9]/g,'')) + (selected ? -1 : 1)).toLocaleString();
  } catch {
    if (currentUser?.id !== userId) return;
    paint(selected, false);
    const status = button.closest('dialog')?.querySelector('[role=status]');
    if (status) status.textContent = 'Couldn’t save that change. Try again.';
    else communityStatus('Couldn’t save that change. Try again.');
  }
}

function communitySeenKey(id) {
  return 'benza.community.activity.seen.' + id;
}

async function refreshCommunityBadge(bell) {
  const id = bell?.dataset.activityOwner;
  if (!id || currentUser?.id !== id) return;
  const key = communitySeenKey(id);
  try {
    const seen = localStorage.getItem(key);
    let query = supabaseClient.rpc('community_personal_activity', {}, {head:true,count:'exact'});
    if (seen) query = query.gt('occurred_at', seen);
    const {count} = await communityData(query);
    if (currentUser?.id !== id || localStorage.getItem(key) !== seen) return;
    bell.lastChild.textContent = count > 99 ? '99+' : String(count || 0);
    bell.lastChild.hidden = !count;
    bell.setAttribute('aria-label', count ? 'Community activity, ' + count + ' unread' : 'Community activity');
  } catch { /* Keep the last successful count during a connection interruption. */ }
}

function refreshVisibleCommunityBadge() {
  const bell = document.querySelector('.communityBell');
  if (bell && !document.hidden && bell.getClientRects().length) void refreshCommunityBadge(bell);
}
setInterval(refreshVisibleCommunityBadge, 30000);
document.addEventListener('visibilitychange', refreshVisibleCommunityBadge);

function openCommunityList(title) {
  const userId = currentUser?.id;
  if (!userId) return;
  const activity = title === 'Activity';
  const followers = title === 'Followers';
  const dialog = communityElement('dialog', 'communityListDialog');
  const list = communityElement('div', 'communityPeopleList');
  const status = communityElement('p', 'communityStatus');
  status.setAttribute('role', 'status');
  const more = communityButton('Load more', load, 'communitySecondary');
  const close = communityButton('×', () => dialog.close(), 'communityListClose');
  close.setAttribute('aria-label', 'Close ' + title);
  const head = communityElement('header', 'communityProfileHead');
  head.append(communityElement('h3', '', title), close);
  dialog.setAttribute('aria-label', title);
  const scroll = communityElement('div', 'communityListScroll');
  scroll.append(list, status, more);
  dialog.append(head, scroll);
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
  let offset = 0;
  let after = null;
  async function load() {
    more.disabled = true;
    status.textContent = 'Loading…';
    const key = followers ? 'follower_id' : 'followed_id';
    try {
      let query = activity ? supabaseClient.rpc('community_personal_activity')
        .order('occurred_at', {ascending:false}).order('actor').order('kind').order('post_id')
        : supabaseClient.from('community_follows').select(key)
          .eq(followers ? 'followed_id' : 'follower_id', userId).order(key);
      if (!activity && after) query = query.gt(key, after);
      const {data} = await communityData(activity ? query.range(offset, offset + 30) : query.limit(31));
      const page = data.slice(0,30);
      const ids = page.map(row => row.actor || row[key]);
      const uniqueIds = [...new Set(ids)];
      const [profiles, relations, incoming] = ids.length ? await Promise.all([
        communityData(supabaseClient.from('community_profiles').select('id,display_name,avatar_style,avatar_initials').in('id',uniqueIds)),
        communityData(supabaseClient.from('community_follows').select('followed_id').eq('follower_id',userId).in('followed_id',uniqueIds)),
        followers ? {data:[]} : communityData(supabaseClient.from('community_follows').select('follower_id').eq('followed_id',userId).in('follower_id',uniqueIds))
      ]) : [{data:[]},{data:[]},{data:[]}];
      const followed = new Set(relations.data.map(row => row.followed_id));
      const followsMe = new Set(incoming.data.map(row => row.follower_id));
      if (!dialog.open || currentUser?.id !== userId) return;
      const names = new Map(profiles.data.map(profile => [profile.id, profile]));
      for (const row of page) {
        const profile = names.get(row.actor || row[key]);
        const name = profile?.display_name || 'Collector';
        const entry = communityElement('div', 'communityListEntry');
        const label = activity ? name + (row.kind === 'follow' ? ' followed you' : ' liked your post') : name;
        const body = communityElement('div');
        body.append(profile ? communityButton(label, () => {
          dialog.close();
          void showBullionGallery('profile', profile.id);
        }, 'communityAuthor') : communityElement('strong','',label));
        if (activity) {
          if (row.caption) body.append(communityElement('p','',row.caption));
          body.append(communityElement('small','',new Date(row.occurred_at).toLocaleString(undefined,
            {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})));
        }
        entry.append(communityAvatar(profile), body);
        if (profile && profile.id !== userId) {
          const inactive = followers || followsMe.has(profile.id) ? 'Follow back' : 'Follow';
          const active = followed.has(profile.id);
          const follow = communityButton(active ? 'Following' : inactive, () =>
            updateBullionFollow({author_id:profile.id}, follow.getAttribute('aria-pressed') === 'true', follow), 'communityRowFollow');
          follow.dataset.followAuthor = profile.id;
          follow.dataset.inactiveLabel = inactive;
          follow.setAttribute('aria-pressed', active);
          entry.append(follow);
        }
        list.append(entry);
      }
      if (activity && !offset && page.length) {
        const key = communitySeenKey(userId);
        const latest = page[0].occurred_at;
        if (!localStorage.getItem(key) || latest > localStorage.getItem(key)) localStorage.setItem(key, latest);
        refreshVisibleCommunityBadge();
      }
      if (!activity && page.length) after = page[page.length - 1][key];
      offset += page.length;
      more.textContent = 'Load more';
      status.textContent = offset ? '' : ({Activity:'New follows and likes will appear here.', Followers:'No followers yet.', Following:'You haven’t followed anyone yet.'})[title];
      more.hidden = data.length <= 30;
    } catch {
      status.textContent = 'Couldn’t load this list.';
      more.textContent = 'Try again';
    } finally {
      more.disabled = false;
    }
  }
  void load();
}

function communityFormField(label, input) {
  const wrapper = communityElement('label', '', label);
  wrapper.append(input);
  return wrapper;
}

function communitySelect(values, labelForValue = value => value) {
  const select = communityElement('select');
  for (const value of values) {
    const option = communityElement('option', '', labelForValue(value));
    option.value = value;
    select.append(option);
  }
  return select;
}

function openCommunityDialog(title, fields, action, submit) {
  const dialog = communityNode('communityDialog');
  const form = communityNode('communityForm');
  const status = communityNode('communityFormStatus');
  const button = communityNode('communityDialogSubmit');
  const cancel = communityNode('communityDialogCancel');
  const userId = currentUser?.id;
  communityNode('communityDialogTitle').textContent = title;
  communityNode('communityFormFields').replaceChildren(...fields);
  status.textContent = '';
  button.textContent = action;
  cancel.onclick = () => dialog.close();
  dialog.oncancel = event => { if (button.disabled) event.preventDefault(); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (button.disabled || currentUser?.id !== userId) return;
    button.disabled = cancel.disabled = true;
    status.textContent = '';
    try {
      const message = await submit();
      dialog.close();
      if (currentUser?.id === userId) {
        await loadBullionGallery();
        if (message) communityStatus(message);
      }
    } catch (error) {
      const nameTaken = error.code === '23505' && error.message?.includes('community_profiles_display_name_unique');
      status.textContent = nameTaken ? 'That display name is already taken. Choose another name.'
        : error.message?.includes('community_profile_content_allowed')
          ? 'Edit your display name or bio to remove abusive or explicit language.'
          : 'Couldn’t complete that action. Please try again.';
    } finally {
      button.disabled = cancel.disabled = false;
    }
  };
  dialog.showModal();
}

function openCommunityPhoto(photo) {
  const dialog = communityElement('dialog', 'communityPhotoDialog');
  dialog.setAttribute('aria-label', 'Community photo viewer');
  const controls = communityElement('div', 'communityPhotoControls');
  const viewport = communityElement('div', 'communityPhotoViewport');
  const frame = communityElement('div', 'communityPhotoFrame');
  const image = photo.cloneNode();
  let zoom = 1;
  let pinch;
  const zoomOut = communityButton('−', () => setZoom(zoom / 1.5));
  const zoomIn = communityButton('+', () => setZoom(zoom * 1.5));
  zoomOut.setAttribute('aria-label', 'Zoom out');
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const close = communityButton('Close', () => dialog.close());
  close.autofocus = true;

  function setZoom(value, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    const previous = zoom;
    zoom = Math.max(1, Math.min(4, value));
    const left = (viewport.scrollLeft + x) * zoom / previous - x;
    const top = (viewport.scrollTop + y) * zoom / previous - y;
    frame.style.width = frame.style.height = (zoom * 100) + '%';
    viewport.scrollLeft = left;
    viewport.scrollTop = top;
    zoomOut.disabled = zoom === 1;
    zoomIn.disabled = zoom === 4;
  }

  function pinchDistance(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  viewport.addEventListener('touchstart', event => {
    if (event.touches.length === 2) pinch = {distance:pinchDistance(event.touches), zoom};
  });
  viewport.addEventListener('touchmove', event => {
    if (event.touches.length !== 2 || !pinch?.distance) return;
    event.preventDefault();
    const [first, second] = event.touches;
    const bounds = viewport.getBoundingClientRect();
    setZoom(pinch.zoom * pinchDistance(event.touches) / pinch.distance,
      (first.clientX + second.clientX) / 2 - bounds.left, (first.clientY + second.clientY) / 2 - bounds.top);
  }, {passive:false});
  viewport.addEventListener('touchend', () => { pinch = null; });
  viewport.addEventListener('touchcancel', () => { pinch = null; });

  frame.append(image);
  viewport.append(frame);
  controls.append(zoomOut, zoomIn, close);
  dialog.append(controls, viewport);
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  document.body.append(dialog);
  dialog.showModal();
  setZoom(1);
}

async function prepareBullionPhoto(file) {
  if (!file || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', {alpha:false});
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new Error('Couldn’t prepare this photo.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function composeBullionPost() {
  if (!communitySignIn('post in Community')) return;
  const userId = currentUser.id;
  const hasProfile = bullionCommunity.account === userId && !!bullionCommunity.profile;
  const name = communityElement('input');
  name.maxLength = 32;
  name.minLength = 2;
  name.required = !hasProfile;
  const photo = communityElement('input');
  photo.type = 'file'; photo.accept = 'image/*'; photo.required = false;
  const metal = communitySelect(communityMetals);
  const type = communitySelect(communityPhotoTypes, communityItemTypeLabel);
  const caption = communityElement('textarea');
  caption.placeholder = 'What would you like to share about bullion?';
  caption.maxLength = 280; caption.minLength = 3; caption.required = true;
  const fields = hasProfile ? [] : [communityFormField('Public display name', name)];
  const picker = communityElement('label', 'communityPhotoPicker');
  const pickerTitle = communityElement('strong', '', 'Add a photo (optional)');
  const pickerDetail = communityElement('span', '', 'Up to 25 MB');
  photo.setAttribute('aria-label', 'Add a photo (optional)');
  photo.onchange = () => {
    const file = photo.files[0];
    details.hidden = !file;
    pickerTitle.textContent = file ? 'Change photo' : 'Add a photo (optional)';
    pickerDetail.textContent = file ? file.name : 'Up to 25 MB';
    photo.setCustomValidity(file && file.size > 25 * 1024 * 1024 ? 'Choose a photo under 25 MB.' : '');
  };
  picker.append(photo, pickerTitle, pickerDetail);
  const details = communityElement('div', 'communityPieceDetails');
  details.hidden = true;
  details.append(communityFormField('Metal', metal), communityFormField('Item type', type));
  fields.push(picker, details, communityFormField('Your post', caption),
    communityElement('p', 'communitySubmissionNote', 'Our community is for bullion collectors. We review each post before it appears in the feed to keep posts focused on bullion. Leave out sales offers, personal details, and storage locations.'));
  openCommunityDialog('Post', fields, 'Submit for review', async () => {
    const image = photo.files[0] ? await prepareBullionPhoto(photo.files[0]) : null;
    if (currentUser?.id !== userId) throw new Error('Account changed.');
    if (!hasProfile) {
      const own = await communityData(supabaseClient.from('community_profiles').select('id').eq('id', userId).maybeSingle());
      if (!own.data) await communityData(supabaseClient.from('community_profiles').insert({id:userId, display_name:name.value.trim()}));
    }
    if (currentUser?.id !== userId) throw new Error('Account changed.');
    const id = crypto.randomUUID();
    await communityData(supabaseClient.from('community_posts').insert({
      id, author_id:userId, metal:image ? metal.value.toLowerCase() : 'bullion', item_type:image ? type.value : 'Discussion', caption:caption.value.trim()
    }));
    try {
      if (currentUser?.id !== userId) throw new Error('Account changed.');
      if (image) await communityData(supabaseClient.storage.from('bullion-community').upload(userId + '/' + id + '.jpg', image));
    } catch (error) {
      if (currentUser?.id === userId) await supabaseClient.from('community_posts').delete().eq('id', id);
      throw error;
    }
    return 'Post submitted. It will appear in the feed once approved.';
  });
}

function reportBullionPost(post) {
  if (!communitySignIn('report a bullion post')) return;
  const reason = communitySelect(['Off topic','Privacy concern','Spam or promotion','Inappropriate content']);
  openCommunityDialog('Report this post', [communityFormField('Reason', reason)], 'Send report', async () => {
    const result = await supabaseClient.from('community_reports')
      .insert({post_id:post.id, reporter_id:currentUser.id, reason:reason.value});
    if (result.error?.code === '23505') return 'You already have an open report for this post.';
    if (result.error) throw result.error;
    return 'Report sent for review.';
  });
}

function blockBullionCollector(authorId) {
  if (!communitySignIn('block a collector')) return;
  openCommunityDialog('Block this collector?',
    [communityElement('p', '', 'Their posts and comments will be hidden and any follows between you will be removed.')], 'Block collector', async () => {
      const result = await supabaseClient.from('community_blocks').insert({blocker_id:currentUser.id, blocked_id:authorId});
      if (result.error && result.error.code !== '23505') throw result.error;
      return 'Collector blocked.';
    });
}

function unblockBullionCollector(collector) {
  const userId = currentUser?.id;
  if (!userId) return;
  openCommunityDialog('Unblock ' + collector.display_name + '?',
    [communityElement('p', '', 'You can see each other’s Community content again. Previous follows won’t be restored.')],
    'Unblock', async () => {
      await communityData(supabaseClient.from('community_blocks')
        .delete().match({blocker_id:userId, blocked_id:collector.blocked_id}));
      return 'Collector unblocked.';
    });
}

function deleteBullionPost(post) {
  openCommunityDialog('Delete your post?', [], 'Delete post', async () => {
    await communityData(supabaseClient.from('community_posts').delete().eq('id', post.id));
    if (post.item_type === 'Discussion') return 'Post deleted.';
    const {error} = await supabaseClient.storage.from('bullion-community').remove([post.photo_path, post.public_photo_path]);
    if (error) console.warn('Community photo cleanup failed:', error);
    return 'Post deleted.';
  });
}

function moderateBullionPost(post, status) {
  const title = {approved:'Approve this post?', declined:'Decline this post?', removed:'Remove this post?'}[status];
  const moderatorId = currentUser?.id;
  const reason = status === 'declined'
    ? communitySelect(['Off topic','Privacy concern','Spam or promotion','Inappropriate content','Photo quality']) : null;
  openCommunityDialog(title, reason ? [communityFormField('Reason', reason)] : [], title.split(' ')[0], async () => {
    if (status === 'approved' && post.item_type !== 'Discussion') {
      // Publish a new JPEG rendered from pixels. The submitted file stays private.
      const bucket = supabaseClient.storage.from('bullion-community');
      const {data: original} = await communityData(bucket.download(post.photo_path));
      const image = await prepareBullionPhoto(original);
      if (currentUser?.id !== moderatorId) throw new Error('Account changed.');
      const {error} = await bucket.upload(post.public_photo_path, image);
      if (error && String(error.statusCode) !== '409') throw error;
    }
    if (currentUser?.id !== moderatorId) throw new Error('Account changed.');
    const changes = {status, review_reason:reason?.value || null};
    if (status === 'approved') changes.published_at = new Date().toISOString();
    await communityData(supabaseClient.from('community_posts').update(changes).eq('id', post.id).eq('status', post.status).select('id').single());
    return status === 'approved' ? 'Post published.' : 'Review saved.';
  });
}

async function resolveBullionReports(postId) {
  try {
    await communityData(supabaseClient.from('community_reports').update({resolved_at:new Date().toISOString()})
      .eq('post_id', postId).is('resolved_at', null));
    await loadBullionGallery();
  } catch {
    communityStatus('Couldn’t resolve those reports. Try again.');
  }
}
