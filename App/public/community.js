'use strict';

const bullionCommunity = {
  view: 'discover', author: null, page: 0, request: 0, loading: false,
  profile: null, moderator: false, account: null
};
const communityPageSize = 12;
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

function openBullionNewsSection(section) {
  const community = section === 'community';
  communityNode('communityPanel').hidden = !community;
  communityNode('communityMarketNews').hidden = community;
  communityNode('newsRefreshButton').hidden = community;
  communityNode('communityNewsTab').setAttribute('aria-pressed', !community);
  communityNode('communityGalleryTab').setAttribute('aria-pressed', community);
  if (community) void showBullionGallery('discover');
  else {
    bullionCommunity.request++;
    bullionCommunity.loading = false;
    communityNode('communityFeed').replaceChildren();
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
  if ((view === 'mine' || view === 'following') && !communitySignIn('use Bullion Community')) return;
  bullionCommunity.view = view;
  bullionCommunity.author = author;
  bullionCommunity.page = 0;
  for (const button of document.querySelectorAll('[data-community-view]')) {
    button.setAttribute('aria-pressed', button.dataset.communityView === view);
  }
  await loadBullionGallery();
}

async function loadMoreBullionPosts() {
  if (!bullionCommunity.loading) await loadBullionGallery(true);
}

async function loadBullionGallery(append = false) {
  const request = ++bullionCommunity.request;
  const userId = currentUser?.id || null;
  const {view, author, page} = bullionCommunity;
  const feed = communityNode('communityFeed');
  const more = communityNode('communityMore');
  bullionCommunity.loading = true;
  bullionCommunity.account = userId;
  if (!append) feed.replaceChildren();
  more.hidden = true;
  communityStatus('Loading community…');

  try {
    if (!supabaseClient) throw new Error('Community is unavailable.');
    const [profile, membership] = userId ? await Promise.all([
      communityData(supabaseClient.from('community_profiles').select('id,display_name').eq('id', userId).maybeSingle()),
      communityData(supabaseClient.from('community_moderators').select('user_id').eq('user_id', userId).maybeSingle())
    ]) : [{data:null}, {data:null}];
    if (!communityCurrent(request, userId)) return;
    bullionCommunity.profile = profile.data;
    bullionCommunity.moderator = !!membership.data;
    communityNode('communityReviewTab').hidden = !bullionCommunity.moderator;
    if (view === 'review' && !bullionCommunity.moderator) return;

    let reports = [];
    let query = supabaseClient.from('community_posts')
      .select('id,author_id,metal,item_type,caption,photo_path,public_photo_path,status,created_at,published_at,review_reason,community_profiles(display_name),community_likes(count)');
    if (view === 'mine') query = query.eq('author_id', userId);
    else if (view === 'review') {
      const result = await communityData(supabaseClient.from('community_reports')
        .select('post_id,reason').is('resolved_at', null).limit(100));
      reports = result.data || [];
      const reportedIds = [...new Set(reports.map(report => report.post_id))];
      query = reportedIds.length
        ? query.or('status.eq.pending,id.in.(' + reportedIds.join(',') + ')')
        : query.eq('status', 'pending');
    } else {
      query = query.eq('status', 'approved');
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
      !append && (view === 'profile' || view === 'mine')
        ? getBullionProfile(view === 'mine' ? userId : author, view === 'mine')
        : null
    ]);
    if (!communityCurrent(request, userId)) return;

    if (profileCard) feed.append(profileCard);
    const liked = new Set(likeRows.data.map(row => row.post_id));
    const followed = new Set(followRows.data.map(row => row.followed_id));
    const signed = new Map((photos.data || []).map(photo => [photo.path, photo.signedUrl]));
    for (const post of posts) {
      feed.append(renderBullionPost(post, signed.get(communityPhotoPath(post)), liked, followed, reports));
    }
    communityStatus(posts.length ? '' : {
      discover:'No published posts yet. Start a bullion discussion or share a photo.',
      mine:'You haven’t submitted a post yet.',
      following:'No approved posts from collectors you follow yet.',
      review:'The review queue is clear.',
      profile:'No approved posts from this collector.'
    }[view]);
    bullionCommunity.page = offset / communityPageSize + 1;
    more.hidden = results.length <= communityPageSize;
  } catch (error) {
    if (communityCurrent(request, userId)) {
      communityStatus('Couldn’t load the gallery. Try again.');
      if (append) more.hidden = false;
      else feed.append(communityButton('Try again', () => loadBullionGallery()));
    }
    console.warn('Bullion Community load failed:', error);
  } finally {
    if (request === bullionCommunity.request) bullionCommunity.loading = false;
  }
}

async function getBullionProfile(authorId, inMyPosts = false) {
  const isOwner = currentUser?.id === authorId;
  const [profile, posts, followers, following, likes] = await Promise.all([
    communityData(supabaseClient.from('community_profiles').select('display_name').eq('id', authorId).maybeSingle()),
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
  header.append(communityElement('h3', '', profile.data?.display_name || 'Your collector profile'));
  if (inMyPosts) header.append(communityButton('View public profile', () => showBullionGallery('profile', authorId)));
  const stats = communityElement('dl', 'communityProfileStats');
  for (const [label, count] of [
    ['Published posts', posts.count], ['Followers', followers.count],
    ['Following', following.count], ['Likes received', likes.count]
  ]) {
    const stat = communityElement('div');
    stat.append(communityElement('dt', '', label),
      communityElement('dd', '', (count ?? 0).toLocaleString()));
    stats.append(stat);
  }
  card.append(header, stats);
  return card;
}

function renderBullionPost(post, photoUrl, liked, followed, reports) {
  const article = communityElement('article', 'communityPost');
  const heading = communityElement('div', 'communityPostHead');
  const name = post.community_profiles?.display_name || 'Collector';
  heading.append(communityButton(name, () => showBullionGallery('profile', post.author_id), 'communityAuthor'));
  const label = post.metal[0].toUpperCase() + post.metal.slice(1) + ' · ' + post.item_type;
  heading.append(communityElement('span', 'communityBadge', label));
  article.append(heading);

  if (photoUrl) {
    const photo = communityElement('img', 'communityPhoto');
    photo.src = photoUrl;
    photo.alt = post.metal + ' ' + post.item_type.toLowerCase() + ' shared by ' + name;
    photo.referrerPolicy = 'no-referrer';
    article.append(photo);
  } else if (post.item_type !== 'Discussion' && (post.status === 'pending' || post.status === 'approved')) {
    article.append(communityElement('p', 'communityPhotoStatus', 'Photo unavailable'));
  }
  const body = communityElement('div', 'communityPostBody');
  const actions = communityElement('div', 'communityPostActions');
  body.append(communityElement('p', '', post.caption));
  if (post.status !== 'approved') body.append(communityElement('p', 'communityBadge',
    post.status === 'pending' ? 'Awaiting review' : post.status === 'declined' ? 'Declined' : 'Removed'));
  if (post.status === 'declined' && post.review_reason) body.append(communityElement('p', 'communityBadge', post.review_reason));
  if (post.status === 'approved') {
    const selected = liked.has(post.id);
    const count = post.community_likes?.[0]?.count || 0;
    const heart = communityButton((selected ? '♥ ' : '♡ ') + count,
      () => updateBullionReaction('like', post, selected, heart));
    heart.setAttribute('aria-pressed', selected);
    heart.setAttribute('aria-label', selected ? 'Unlike post' : 'Like post');
    actions.append(heart);
    if (post.author_id !== currentUser?.id) {
      const follows = followed.has(post.author_id);
      const follow = communityButton(follows ? 'Following' : 'Follow',
        () => updateBullionReaction('follow', post, follows, follow));
      follow.setAttribute('aria-pressed', follows);
      actions.append(follow, communityButton('Report', () => reportBullionPost(post)),
        communityButton('Block', () => blockBullionCollector(post)));
    }
  }
  if (post.author_id === currentUser?.id) actions.append(communityButton('Delete', () => deleteBullionPost(post)));
  if (post.status === 'approved' && bullionCommunity.moderator) {
    actions.append(communityButton('Remove', () => moderateBullionPost(post, 'removed')));
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
      actions.append(communityButton('Resolve reports', () => resolveBullionReports(post.id)));
    }
  }
  body.append(actions);
  article.append(body);
  return article;
}

async function updateBullionReaction(kind, post, selected, button) {
  if (!communitySignIn(kind === 'like' ? 'like bullion photos' : 'follow collectors') || button.disabled) return;
  const userId = currentUser.id;
  const table = kind === 'like' ? 'community_likes' : 'community_follows';
  const keys = kind === 'like' ? {user_id:userId, post_id:post.id} : {follower_id:userId, followed_id:post.author_id};
  button.disabled = true;
  try {
    const target = supabaseClient.from(table);
    await communityData(selected ? target.delete().match(keys) : target.insert(keys));
    if (currentUser?.id === userId) await loadBullionGallery();
  } catch {
    if (currentUser?.id === userId) communityStatus('Couldn’t save that change. Try again.');
  } finally {
    button.disabled = false;
  }
}

function communityFormField(label, input) {
  const wrapper = communityElement('label', '', label);
  wrapper.append(input);
  return wrapper;
}

function communitySelect(values) {
  const select = communityElement('select');
  for (const value of values) select.append(communityElement('option', '', value));
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
    } catch {
      status.textContent = 'Couldn’t complete that action. Please try again.';
    } finally {
      button.disabled = cancel.disabled = false;
    }
  };
  dialog.showModal();
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
  const metal = communitySelect(['Gold','Silver','Platinum','Palladium','Copper']);
  const type = communitySelect(['Coin','Round','Bar','Display']);
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
    if (result.error && result.error.code !== '23505') throw result.error;
    return 'Report sent for review.';
  });
}

function blockBullionCollector(post) {
  if (!communitySignIn('block a collector')) return;
  openCommunityDialog('Block this collector?',
    [communityElement('p', '', 'Their posts will be hidden and any follows between you will be removed.')], 'Block collector', async () => {
      const result = await supabaseClient.from('community_blocks').insert({blocker_id:currentUser.id, blocked_id:post.author_id});
      if (result.error && result.error.code !== '23505') throw result.error;
      return 'Collector blocked.';
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
