import React, {useEffect, useRef, useState} from 'react';
import {LucideIcon, Skeleton} from '@tryghost/shade';

import NiceModal from '@ebay/nice-modal-react';
import {Activity, ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Button, LoadingIndicator} from '@tryghost/admin-x-design-system';

import APAvatar from '@components/global/APAvatar';
import ArticleModal from '@components/feed/ArticleModal';
import NotificationItem from '@components/activities/NotificationItem';
import Separator from '@components/global/Separator';

import Layout from '@components/layout';
import getUsername from '@utils/get-username';
import truncate from '@utils/truncate';
import {EmptyViewIcon, EmptyViewIndicator} from '@src/components/global/EmptyViewIndicator';
import {
    GET_ACTIVITIES_QUERY_KEY_NOTIFICATIONS,
    useActivitiesForUser,
    useUserDataForUser
} from '@hooks/use-activity-pub-queries';
import {type NotificationType} from '@components/activities/NotificationIcon';
import {handleProfileClick} from '@utils/handle-profile-click';
import {stripHtml} from '@src/utils/content-formatters';

interface NotificationsProps {}

enum ACTIVITY_TYPE {
    CREATE = 'Create',
    LIKE = 'Like',
    FOLLOW = 'Follow',
    REPOST = 'Announce'
}

interface GroupedActivity {
    type: ACTIVITY_TYPE;
    actors: ActorProperties[];
    object: ObjectProperties;
    id?: string;
}

interface NotificationGroupDescriptionProps {
    group: GroupedActivity;
}

const getActivityBadge = (activity: GroupedActivity): NotificationType => {
    switch (activity.type) {
    case ACTIVITY_TYPE.CREATE:
        return 'reply';
    case ACTIVITY_TYPE.FOLLOW:
        return 'follow';
    case ACTIVITY_TYPE.LIKE:
        return 'like';
    case ACTIVITY_TYPE.REPOST:
        return 'repost';
    }
};

const groupActivities = (activities: Activity[]): GroupedActivity[] => {
    const groups: {[key: string]: GroupedActivity} = {};

    // Activities are already sorted by time from the API
    activities.forEach((activity) => {
        let groupKey = '';

        switch (activity.type) {
        case ACTIVITY_TYPE.FOLLOW:
            // Group follows that are next to each other in the array
            groupKey = `follow_${activity.type}`;
            break;
        case ACTIVITY_TYPE.LIKE:
            if (activity.object?.id) {
                // Group likes by the target object
                groupKey = `like_${activity.object.id}`;
            }
            break;
        case ACTIVITY_TYPE.REPOST:
            if (activity.object?.id) {
                // Group reposts by the target object
                groupKey = `announce_${activity.object.id}`;
            }
            break;
        case ACTIVITY_TYPE.CREATE:
            // Don't group creates/replies
            groupKey = `create_${activity.id}`;
            break;
        }

        if (!groups[groupKey]) {
            groups[groupKey] = {
                type: activity.type as ACTIVITY_TYPE,
                actors: [],
                object: activity.object,
                id: activity.id
            };
        }

        // Add actor if not already in the group
        if (!groups[groupKey].actors.find(a => a.id === activity.actor.id)) {
            groups[groupKey].actors.push(activity.actor);
        }
    });

    // Return in same order as original activities
    return Object.values(groups);
};

const NotificationGroupDescription: React.FC<NotificationGroupDescriptionProps> = ({group}) => {
    const [firstActor, secondActor, ...otherActors] = group.actors;
    const hasOthers = otherActors.length > 0;

    const actorClass = 'cursor-pointer font-semibold hover:underline';

    const actorText = (
        <>
            <span
                className={actorClass}
                onClick={e => handleProfileClick(firstActor, e)}
            >{firstActor.name}</span>
            {secondActor && (
                <>
                    {hasOthers ? ', ' : ' and '}
                    <span
                        className={actorClass}
                        onClick={e => handleProfileClick(secondActor, e)}
                    >{secondActor.name}</span>
                </>
            )}
            {hasOthers && ' and others'}
        </>
    );

    switch (group.type) {
    case ACTIVITY_TYPE.FOLLOW:
        return <>{actorText} started following you</>;
    case ACTIVITY_TYPE.LIKE:
        return <>{actorText} liked your {group.object?.type === 'Article' ? 'post' : 'note'} <span className='font-semibold'>{group.object?.name || ''}</span></>;
    case ACTIVITY_TYPE.REPOST:
        return <>{actorText} reposted your {group.object?.type === 'Article' ? 'post' : 'note'} <span className='font-semibold'>{group.object?.name || ''}</span></>;
    case ACTIVITY_TYPE.CREATE:
        if (group.object?.inReplyTo && typeof group.object?.inReplyTo !== 'string') {
            let content = stripHtml(group.object.inReplyTo.content || '');

            // If the post has a name, use that instead of the content (short
            // form posts do not have a name)
            if (group.object.inReplyTo.name) {
                content = stripHtml(group.object.inReplyTo.name);
            }

            return <>{actorText} replied to your post <span className='font-semibold'>{truncate(content, 80)}</span></>;
        }
    }
    return <></>;
};

const Notifications: React.FC<NotificationsProps> = () => {
    const user = 'index';

    const [openStates, setOpenStates] = React.useState<{[key: string]: boolean}>({});

    const toggleOpen = (groupId: string) => {
        setOpenStates(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const maxAvatars = 5;

    const {data: userProfile, isLoading: isLoadingProfile} = useUserDataForUser(user) as {data: ActorProperties | null, isLoading: boolean};

    const {getActivitiesQuery} = useActivitiesForUser({
        handle: user,
        includeOwn: true,
        includeReplies: true,
        filter: {
            type: ['Follow', 'Like', `Create:Note`, `Announce:Note`, `Announce:Article`]
        },
        limit: 120,
        key: GET_ACTIVITIES_QUERY_KEY_NOTIFICATIONS
    });

    const {data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: isLoadingActivities} = getActivitiesQuery;

    const isLoading = isLoadingProfile === true || isLoadingActivities === true;

    const groupedActivities = (data?.pages.flatMap((page) => {
        const filtered = page.data
            // Remove duplicates
            .filter(
                (activity, index, self) => index === self.findIndex(a => a.id === activity.id)
            )
            // Remove our own likes
            .filter((activity) => {
                if (activity.type === ACTIVITY_TYPE.LIKE && activity.actor?.id === userProfile?.id) {
                    return false;
                }

                return true;
            })
            // Remove follower likes if they are not for our own posts
            .filter((activity) => {
                if (activity.type === ACTIVITY_TYPE.LIKE && activity.object?.attributedTo?.id !== userProfile?.id) {
                    return false;
                }

                return true;
            })
            // Remove reposts that are not for our own posts
            .filter((activity) => {
                if (activity.type === ACTIVITY_TYPE.REPOST && activity.object?.attributedTo?.id !== userProfile?.id) {
                    return false;
                }

                return true;
            })
            // Remove create activities that are not replies to our own posts
            .filter((activity) => {
                if (
                    activity.type === ACTIVITY_TYPE.CREATE &&
                    activity.object?.inReplyTo?.attributedTo?.id !== userProfile?.id
                ) {
                    return false;
                }

                return true;
            })
            // Remove our own create activities
            .filter((activity) => {
                if (
                    activity.type === ACTIVITY_TYPE.CREATE &&
                    activity.actor?.id === userProfile?.id
                ) {
                    return false;
                }

                return true;
            });

        return groupActivities(filtered);
    }) ?? Array(5).fill({actors: [{}]}));

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        });

        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const [showLoadingMessage, setShowLoadingMessage] = useState(false);

    useEffect(() => {
        let timeoutID: number;

        if (isLoading) {
            timeoutID = setTimeout(() => {
                setShowLoadingMessage(true);
            }, 3000);
        } else {
            setShowLoadingMessage(false);
        }

        return () => {
            clearTimeout(timeoutID);
        };
    }, [isLoading]);

    const handleActivityClick = (group: GroupedActivity, index: number) => {
        switch (group.type) {
        case ACTIVITY_TYPE.CREATE:
            NiceModal.show(ArticleModal, {
                activityId: group.object.id,
                object: group.object,
                actor: group.actors[0],
                focusReplies: true,
                width: typeof group.object?.inReplyTo === 'object' && group.object?.inReplyTo?.type === 'Article' ? 'wide' : 'narrow'
            });
            break;
        case ACTIVITY_TYPE.LIKE:
            NiceModal.show(ArticleModal, {
                activityId: group.id,
                object: group.object,
                actor: group.object.attributedTo as ActorProperties,
                width: group.object?.type === 'Article' ? 'wide' : 'narrow'
            });
            break;
        case ACTIVITY_TYPE.FOLLOW:
            if (group.actors.length > 1) {
                toggleOpen(group.id || `${group.type}_${index}`);
            } else {
                handleProfileClick(group.actors[0]);
            }
            break;
        case ACTIVITY_TYPE.REPOST:
            NiceModal.show(ArticleModal, {
                activityId: group.id,
                object: group.object,
                actor: group.object.attributedTo as ActorProperties,
                width: group.object?.type === 'Article' ? 'wide' : 'narrow'
            });
            break;
        }
    };

    return (
        <Layout>
            {isLoading && showLoadingMessage && (
                <div className='absolute bottom-8 left-8 right-[calc(292px+64px)] flex animate-fade-in items-start justify-center rounded-md bg-grey-100 px-3 py-2 font-medium backdrop-blur-md'>
                    <LucideIcon.Gauge className='mr-1.5 min-w-5 text-purple' size={20} strokeWidth={1.5} />
                    Notifications are a little slow at the moment, we&apos;re working on improving the performance.
                </div>
            )}
            <div className='z-0 flex w-full flex-col items-center'>
                {
                    isLoading === false && groupedActivities.length === 0 && (
                        <EmptyViewIndicator>
                            <EmptyViewIcon><LucideIcon.Bell /></EmptyViewIcon>
                            Quiet for now, but not for long! When someone likes, boosts, or replies to you, you&apos;ll find it here.
                        </EmptyViewIndicator>
                    )
                }
                {
                    (groupedActivities.length > 0) && (
                        <>
                            <div className='my-8 flex w-full max-w-[620px] flex-col'>
                                {groupedActivities.map((group, index) => (
                                    <React.Fragment key={group.id || `${group.type}_${index}`}>
                                        <NotificationItem
                                            className='hover:bg-gray-75 dark:hover:bg-gray-950'
                                            onClick={() => handleActivityClick(group, index)}
                                        >
                                            {!isLoading ? <NotificationItem.Icon type={getActivityBadge(group)} /> : <Skeleton className='rounded-full' containerClassName='flex h-10 w-10' />}
                                            <NotificationItem.Avatars>
                                                <div className='flex flex-col'>
                                                    <div className='mt-0.5 flex items-center gap-1.5'>
                                                        {!openStates[group.id || `${group.type}_${index}`] && group.actors.slice(0, maxAvatars).map((actor: ActorProperties) => (
                                                            <APAvatar
                                                                key={actor.id}
                                                                author={actor}
                                                                isLoading={isLoading}
                                                                size='notification'
                                                            />
                                                        ))}
                                                        {group.actors.length > maxAvatars && (!openStates[group.id || `${group.type}_${index}`]) && (
                                                            <div
                                                                className='flex h-9 w-5 items-center justify-center text-sm text-gray-700'
                                                            >
                                                                {`+${group.actors.length - maxAvatars}`}
                                                            </div>
                                                        )}

                                                        {group.actors.length > 1 && (
                                                            <Button
                                                                className={`transition-color flex h-9 items-center rounded-full bg-transparent text-gray-700 hover:opacity-60 dark:text-gray-600 ${openStates[group.id || `${group.type}_${index}`] ? 'w-full justify-start pl-1' : '-ml-2 w-9 justify-center'}`}
                                                                hideLabel={!openStates[group.id || `${group.type}_${index}`]}
                                                                icon='chevron-down'
                                                                iconColorClass={`w-[12px] h-[12px] ${openStates[group.id || `${group.type}_${index}`] ? 'rotate-180' : ''}`}
                                                                label={`${openStates[group.id || `${group.type}_${index}`] ? 'Hide' : 'Show all'}`}
                                                                unstyled
                                                                onClick={(event) => {
                                                                    event?.stopPropagation();
                                                                    toggleOpen(group.id || `${group.type}_${index}`);
                                                                }}/>
                                                        )}
                                                    </div>
                                                    <div className={`overflow-hidden transition-all duration-300 ease-in-out  ${openStates[group.id || `${group.type}_${index}`] ? 'mb-2 max-h-[1384px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                                        {openStates[group.id || `${group.type}_${index}`] && group.actors.length > 1 && (
                                                            <div className='flex flex-col gap-2 pt-4'>
                                                                {group.actors.map((actor: ActorProperties) => (
                                                                    <div
                                                                        key={actor.id}
                                                                        className='flex items-center hover:opacity-80'
                                                                        onClick={e => handleProfileClick(actor, e)}
                                                                    >
                                                                        <APAvatar author={actor} size='xs' />
                                                                        <span className='ml-2 text-base font-semibold dark:text-white'>{actor.name}</span>
                                                                        <span className='ml-1 text-base text-gray-700 dark:text-gray-600'>{getUsername(actor)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </NotificationItem.Avatars>
                                            <NotificationItem.Content>
                                                <div className='line-clamp-2 text-pretty text-black dark:text-white'>
                                                    {!isLoading ?
                                                        <NotificationGroupDescription group={group} /> :
                                                        <>
                                                            <Skeleton />
                                                            <Skeleton className='w-full max-w-60' />
                                                        </>
                                                    }
                                                </div>
                                                {(
                                                    (group.type === ACTIVITY_TYPE.CREATE && group.object?.inReplyTo) ||
                                                    (group.type === ACTIVITY_TYPE.LIKE && !group.object?.name && group.object?.content) ||
                                                    (group.type === ACTIVITY_TYPE.REPOST && !group.object?.name && group.object?.content)
                                                ) && (
                                                    <div
                                                        dangerouslySetInnerHTML={{__html: stripHtml(group.object?.content || '')}}
                                                        className='ap-note-content mt-1 line-clamp-2 text-pretty text-gray-700 dark:text-gray-600'
                                                    />
                                                )}
                                            </NotificationItem.Content>
                                        </NotificationItem>
                                        {index < groupedActivities.length - 1 && <Separator />}
                                    </React.Fragment>
                                ))}
                            </div>
                            <div ref={loadMoreRef} className='h-1'></div>
                            {isFetchingNextPage && (
                                <div className='flex flex-col items-center justify-center space-y-4 text-center'>
                                    <LoadingIndicator size='md' />
                                </div>
                            )}
                        </>
                    )
                }
            </div>
        </Layout>
    );
};

export default Notifications;
