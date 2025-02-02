import * as actions from '../actions/types'
import { guidGen } from '../lib/browserUtils';
import { getCompletedTags, lookupActivityProgress, isMapCompleted,
    isRewardNode, applyUserUpgrades, applyUserMigrations } from '../lib/skillMapUtils';

export type ModalType = "restart-warning" | "completion" | "report-abuse" | "reset" | "carryover" | "share" | "login" | "delete-account";
export type PageSourceStatus = "approved" | "banned" | "unknown";

// State for the entire page
export interface SkillMapState {
    title: string;
    description: string;
    infoUrl?: string;
    backgroundImageUrl?: string;
    bannerImageUrl?: string;
    user: UserState;
    pageSourceUrl: string;
    pageSourceStatus: PageSourceStatus;
    alternateSourceUrls?: string[];
    maps: { [key: string]: SkillMap };
    selectedItem?: { mapId: string, activityId: string };

    shareState?: ShareState;

    editorView?: EditorViewState;
    modal?: ModalState;
    showProfile?: boolean;
    theme: SkillGraphTheme;
    auth: AuthState;
}

export interface EditorViewState {
    currentHeaderId?: string;
    currentMapId: string;
    currentActivityId: string;
    allowCodeCarryover: boolean;
    previousHeaderId?: string;
    state: "active" | "saving";
}

interface ModalState {
    type: ModalType;
    currentMapId?: string;
    currentActivityId?: string;
}

export interface ShareState {
    headerId: string;
    url?: string;
}

interface AuthState {
    signedIn: boolean;
    profile?: pxt.auth.UserProfile;
    preferences?: pxt.auth.UserPreferences;
}

const initialState: SkillMapState = {
    title: lf("Game Maker Guide"),
    description: lf("Level up your game making skills by completing the tutorials in this guide."),
    pageSourceStatus: "unknown",
    pageSourceUrl: "default",
    user: {
        version: pxt.skillmap.USER_VERSION,
        isDebug: true,
        id: guidGen(),
        mapProgress: {},
        completedTags: {}
    },
    theme: {
        backgroundColor: "var(--body-background-color)",
        pathColor: "#BFBFBF",
        strokeColor: "#000000",
        rewardNodeColor: "var(--primary-color)",
        rewardNodeForeground: "#000000",
        unlockedNodeColor: "var(--secondary-color)",
        unlockedNodeForeground: "#000000",
        lockedNodeColor: "#BFBFBF",
        lockedNodeForeground: "#000000",
        completedNodeColor: "var(--secondary-color)",
        completedNodeForeground: "#000000",
        selectedStrokeColor: "var(--hover-color)",
        pathOpacity: 0.5,
    },
    maps: {},
    auth: {
        signedIn: false
    }
}

const topReducer = (state: SkillMapState = initialState, action: any): SkillMapState => {
    switch (action.type) {
        case actions.ADD_SKILL_MAP:
            return {
                ...state,
                maps: {
                    ...state.maps,
                    [action.map.mapId]: action.map
                }
            }
        case actions.CLEAR_SKILL_MAPS:
            return {
                ...state,
                maps: {}
            };
        case actions.CLEAR_METADATA:
            return {
                ...state,
                title: initialState.title,
                description: initialState.description,
                infoUrl: initialState.infoUrl,
                backgroundImageUrl: undefined,
                bannerImageUrl: undefined,
                alternateSourceUrls: undefined,
                theme: {
                    ...initialState.theme
                }
            };
        case actions.CHANGE_SELECTED_ITEM:
            return {
                ...state,
                selectedItem: {
                    mapId: action.mapId,
                    activityId: action.activityId
                }
            };
        case actions.SET_SKILL_MAP_COMPLETED:
            return {
                ...state,
                user: {
                    ...state.user,
                    mapProgress: {
                        ...state.user.mapProgress,
                        [state.pageSourceUrl] : {
                            ...state.user.mapProgress?.[state.pageSourceUrl],
                            [action.mapId]: {
                                ...state.user.mapProgress?.[state.pageSourceUrl]?.[action.mapId],
                                completionState: "completed"
                            }
                        }
                    }
                }
            }
        case actions.OPEN_ACTIVITY:
            return {
                ...state,
                editorView: {
                    currentMapId: action.mapId,
                    currentActivityId: action.activityId,
                    state: "active",
                    allowCodeCarryover: !!action.carryoverCode,
                    previousHeaderId: action.previousHeaderId,
                    currentHeaderId: lookupActivityProgress(
                        state.user,
                        state.pageSourceUrl,
                        action.mapId,
                        action.activityId,
                    )?.headerId

                }
            };
        case actions.SAVE_AND_CLOSE_ACTIVITY:
            return {
                ...state,
                editorView: {
                    ...state.editorView!,
                    state: "saving"
                }
            };
        case actions.CLOSE_ACTIVITY:
            const currentMap = state.maps[state.editorView!.currentMapId];
            const currentActivityId = state.editorView!.currentActivityId;

            // When a node is completed, we mark any following reward nodes as complete also
            const finishedNodes = action.finished ? getFinishedNodes(currentMap, currentActivityId) : [];
            const selectedItem = finishedNodes.find(el => isRewardNode(el));
            const existing = selectedItem && state.user.mapProgress[state.pageSourceUrl]?.[currentMap.mapId]?.activityState[selectedItem.activityId];

            return {
                ...state,
                selectedItem: selectedItem && !existing ? {
                    mapId: currentMap.mapId,
                    activityId: selectedItem.activityId
                } : state.selectedItem,
                editorView: undefined,
                user: action.finished ?
                    setActivityFinished(state.user, state.pageSourceUrl, currentMap, finishedNodes.map(n => n.activityId)) :
                    state.user
            };
        case actions.RESTART_ACTIVITY:
            return {
                ...state,
                modal: undefined,
                editorView: {
                    state: "active",
                    currentMapId: action.mapId,
                    currentActivityId: action.activityId,
                    allowCodeCarryover: !!action.carryoverCode,
                    previousHeaderId: action.previousHeaderId
                },
                user: setHeaderIdForActivity(
                    state.user,
                    state.pageSourceUrl,
                    state.maps[action.mapId],
                    action.activityId
                )
            }
        case actions.SET_HEADERID_FOR_ACTIVITY:
            const isCurrentActivity = state.editorView?.currentActivityId === action.activityId && state.editorView?.currentMapId === action.mapId;
            return {
                ...state,
                editorView: isCurrentActivity ? {
                    ...state.editorView!,
                    currentHeaderId: action.id
                } : state.editorView,
                user: setHeaderIdForActivity(
                    state.user,
                    state.pageSourceUrl,
                    state.maps[action.mapId],
                    action.activityId,
                    action.id,
                    action.currentStep,
                    action.maxSteps,
                    action.isCompleted
                )
            };
        case actions.SET_USER:
            const pageSourceUrl = state.pageSourceUrl;

            // Apply data structure upgrades
            let user = applyUserUpgrades(action.user, pxt.skillmap.USER_VERSION, pageSourceUrl, state.maps);

            // Migrate user projects from alternate pageSourceUrls, if provided
            if (state.alternateSourceUrls) {
                user = applyUserMigrations(user, pageSourceUrl, state.alternateSourceUrls)
            }

            // Fill in empty objects for remaining maps
            if (!user.mapProgress[pageSourceUrl]) user.mapProgress[pageSourceUrl] = {};
            Object.keys(state.maps).forEach(mapId => {
                if (!user.mapProgress[pageSourceUrl][mapId]) {
                    user.mapProgress[pageSourceUrl][mapId] = { completionState: "incomplete", mapId, activityState: { } };
                }
            })

            return {
                ...state,
                user
            };
        case actions.RESET_USER:
            return {
                ...state,
                user: {
                    ...state.user,
                    completedTags: {
                        ...state.user.completedTags,
                        [state.pageSourceUrl]: {}
                    },
                    mapProgress: {
                        ...state.user.mapProgress,
                        [state.pageSourceUrl]: {}
                    }
                }
            };
        case actions.UPDATE_USER_COMPLETED_TAGS:
            if (!state.pageSourceUrl) return state;
            return {
                ...state,
                user: {
                    ...state.user,
                    completedTags: {
                        ...state.user.completedTags,
                        [state.pageSourceUrl]: getCompletedTags(state.user, state.pageSourceUrl, Object.keys(state.maps).map(key => state.maps[key]))
                    }
                }
            }
        case actions.SET_SHARE_STATUS:
            return {
                ...state,
                shareState: action.headerId || action.url ? {
                    headerId: action.headerId,
                    url: action.url
                } : undefined
            }
        case actions.SET_PAGE_TITLE:
            return {
                ...state,
                title: action.title
            }
        case actions.SET_PAGE_DESCRIPTION:
            return {
                ...state,
                description: action.description
            }
        case actions.SET_PAGE_INFO_URL:
            return {
                ...state,
                infoUrl: action.infoUrl
            }
        case actions.SET_PAGE_BACKGROUND_IMAGE_URL:
            return {
                ...state,
                backgroundImageUrl: action.backgroundImageUrl
            }
        case actions.SET_PAGE_BANNER_IMAGE_URL:
            return {
                ...state,
                bannerImageUrl: action.bannerImageUrl
            }
        case actions.SET_PAGE_THEME:
            return {
                ...state,
                theme: action.theme
            }
        case actions.SET_PAGE_SOURCE_URL:
            return {
                ...state,
                pageSourceUrl: action.url,
                pageSourceStatus: action.status
            }
        case actions.SET_PAGE_ALTERNATE_URLS:
            return {
                ...state,
                alternateSourceUrls: action.urls
            }
        case actions.SHOW_COMPLETION_MODAL:
            return {
                ...state,
                modal: { type: "completion", currentMapId: action.mapId, currentActivityId: action.activityId }
            };
        case actions.SHOW_CARRYOVER_MODAL:
            return {
                ...state,
                modal: { type: "carryover", currentMapId: action.mapId, currentActivityId: action.activityId }
            };
        case actions.SHOW_RESTART_ACTIVITY_MODAL:
            return {
                ...state,
                modal: { type: "restart-warning", currentMapId: action.mapId, currentActivityId: action.activityId }
            };
        case actions.SHOW_REPORT_ABUSE_MODAL:
            return {
                ...state,
                modal: { type: "report-abuse", currentMapId: action.mapId, currentActivityId: action.activityId }
            };
        case actions.SHOW_RESET_USER_MODAL:
            return {
                ...state,
                modal: { type: "reset" }
            };
        case actions.SHOW_SHARE_MODAL:
            return {
                ...state,
                modal: { type: "share", currentMapId: action.mapId, currentActivityId: action.activityId }
            };
        case actions.SHOW_LOGIN_MODAL:
            return {
                ...state,
                modal: { type: "login" }
            }
        case actions.SHOW_DELETE_ACCOUNT_MODAL:
            return {
                ...state,
                modal: { type: "delete-account" }
            }
        case actions.SHOW_USER_PROFILE:
            return {
                ...state,
                showProfile: true
            };
        case actions.HIDE_USER_PROFILE:
            return {
                ...state,
                showProfile: false
            };
        case actions.HIDE_MODAL:
            return {
                ...state,
                modal: undefined
            };
        case actions.SET_USER_PROFILE:
            return {
                ...state,
                auth: {
                    ...state.auth,
                    profile: action.profile,
                    signedIn: !!action.profile?.id
                }
            };
        case actions.SET_USER_PREFERENCES:
            return {
                ...state,
                auth: {
                    ...state.auth,
                    preferences: action.preferences,
                }
            };
        case actions.USER_LOG_OUT:
            return {
                ...state,
                auth: {
                    ...state.auth,
                    signedIn: false
                }
            }
        default:
            return state
    }
}


export function setHeaderIdForActivity(user: UserState, pageSource: string, map: SkillMap, activityId: string, headerId?: string, currentStep?: number, maxSteps?: number, isCompleted = false): UserState {
    const mapId = map.mapId;
    let existing = lookupActivityProgress(user, pageSource, mapId, activityId);

    if (!existing) {
        existing = {
            isCompleted: false,
            activityId,
            currentStep,
            maxSteps,
            headerId
        }
    }

    const currentMapProgress = user.mapProgress?.[pageSource] || {};
    return {
        ...user,
        mapProgress: {
            ...user.mapProgress,
            [pageSource]: {
                ...currentMapProgress,
                [mapId]: {
                    ...(currentMapProgress?.[mapId] || { mapId }),
                    activityState: {
                        ...(currentMapProgress?.[mapId]?.activityState || {}),
                        [activityId]: {
                            ...existing,
                            headerId,
                            currentStep,
                            maxSteps,
                            isCompleted: existing.isCompleted || isCompleted
                        }
                    }
                }
            }
        }
    };
}

export function shouldAllowCodeCarryover(state: SkillMapState, mapId: string, activityId: string) {
    const map = state.maps[mapId];
    const activity = map.activities[activityId];
    return !!(activity?.kind === "activity" && activity.allowCodeCarryover);
}

export function setActivityFinished(user: UserState, pageSource: string, map: SkillMap, activityIds: string[]) {
    const mapId = map.mapId;

    let shouldTransition = false;
    const completedNodes: {[key: string]: ActivityState} = { } ;
    activityIds.forEach(el => {
        let activity = lookupActivityProgress(user, pageSource, mapId, el);
        // Only auto-transition the first time a completion node is reached
        shouldTransition = shouldTransition || (isRewardNode(map.activities[el]) && !activity?.isCompleted);
        completedNodes[el] = (activity || {
            isCompleted: true,
            activityId: el,
            headerId: "",
            currentStep: 0
        })
        completedNodes[el].isCompleted = true;
        completedNodes[el].completedTime = Date.now();
    })

    const currentMapProgress = user.mapProgress?.[pageSource] || {};
    return {
        ...user,
        mapProgress: {
            ...user.mapProgress,
            [pageSource]: {
                ...currentMapProgress,
                [mapId]: {
                    ...(currentMapProgress?.[mapId] || { mapId }),
                    activityState: {
                        ...(currentMapProgress?.[mapId]?.activityState || {}),
                        ...completedNodes
                    },
                    completionState: shouldTransition ? "transitioning" : currentMapProgress?.[mapId]?.completionState
                }
            }
        }
    };
}

function getFinishedNodes(map: SkillMap, activityId: string) {
    const node = map.activities[activityId]
    const completedNodes: MapNode[] = [node];

    // Reward and completion nodes are automatically marked finished
    const autoComplete = map.activities[activityId].next.filter(el => isRewardNode(el));
    return completedNodes.concat(autoComplete);
}

export default topReducer;