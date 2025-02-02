/// <reference path="../lib/skillMap.d.ts" />
import * as React from "react";

import { connect } from 'react-redux';
import { dispatchSaveAndCloseActivity, dispatchShowResetUserModal, dispatchShowLoginModal, dispatchShowUserProfile } from '../actions/dispatch';
import { SkillMapState } from '../store/reducer';
import { isLocal, resolvePath, tickEvent } from "../lib/browserUtils";

import { Dropdown, DropdownItem } from "./Dropdown";
import { isActivityCompleted } from "../lib/skillMapUtils";

interface HeaderBarProps {
    currentMapId?: string;
    currentActivityId?: string;
    activityOpen: boolean;
    showReportAbuse?: boolean;
    signedIn: boolean;
    dispatchSaveAndCloseActivity: () => void;
    dispatchShowResetUserModal: () => void;
    dispatchShowLoginModal: () => void;
    dispatchShowUserProfile: () => void;
}

export class HeaderBarImpl extends React.Component<HeaderBarProps> {
    protected reportAbuseUrl = "https://github.com/contact/report-content";
    protected getSettingItems(): DropdownItem[] {
        const items: DropdownItem[] = [];
        if (this.props.showReportAbuse) {
            items.push({
                id: "report",
                label: lf("Report Abuse"),
                onClick: (id: string) => {
                    tickEvent("skillmap.reportabuse");
                    window.open(this.reportAbuseUrl);
                }
            })
        }

        if (!this.props.activityOpen) {
            items.push({
                id: "reset",
                label: lf("Reset All"),
                onClick: () => {
                    tickEvent("skillmap.reset.warning");
                    this.props.dispatchShowResetUserModal();
                }
            })
        }

        return items;
    }

    protected getOrganizationLogo(targetTheme: pxt.AppTheme) {
        const logoUrl = targetTheme.organizationWideLogo;
        return <div className="header-logo">
            {logoUrl
                ? <img src={isLocal() ? `./assets/${logoUrl}`: logoUrl} alt={lf("{0} Logo", targetTheme.organization)}/>
                : <span className="name">{targetTheme.organization}</span>}
        </div>
    }

    protected getTargetLogo(targetTheme: pxt.AppTheme) {
        const { activityOpen } = this.props;
        return <div className={`ui item logo brand ${!activityOpen ? "noclick" : ""}`}>
            {targetTheme.useTextLogo
                ? [<span className="name" key="org-name" onClick={this.onBackClicked}>{targetTheme.organizationText}</span>,
                   <span className="name-short" key="org-name-short" onClick={this.onBackClicked}>{targetTheme.organizationShortText || targetTheme.organizationText}</span>]
                : (targetTheme.logo || targetTheme.portraitLogo
                    ? <img className="logo" src={targetTheme.logo || targetTheme.portraitLogo} alt={lf("{0} Logo", targetTheme.boardName)}/>
                    : <span className="name"> {targetTheme.boardName}</span>)
            }
        </div>
    }

    protected getHelpItems(): DropdownItem[] {
        const items: DropdownItem[] = [];
        if (this.props.activityOpen) {
            items.push({
                id: "feedback",
                label: lf("Feedback"),
                onClick: this.onBugClicked
            });
        }
        return items;
    }

    protected getUserMenu() {
        const { signedIn } = this.props;
        const items = [];
        const user = pxt.auth.client()?.getState().profile;

        if (signedIn) {
            items.push({
                id: "profile",
                label: lf("My Profile"),
                onClick: this.onProfileClicked
            },{
                id: "signout",
                label: lf("Sign Out"),
                onClick: this.onLogoutClicked
            })
        }

        const avatarElem = user?.idp?.picture?.dataUrl
            ? <div className="avatar"><img src={user?.idp?.picture?.dataUrl} alt={lf("User Menu")}/></div>
            : undefined;

        const initialsElem = user?.idp?.displayName
            ? <span className="circle">{pxt.auth.userInitials(user)}</span>
            : undefined;

        return <div className="user-menu">
            {signedIn
             ? <Dropdown icon="star" items={items} picture={avatarElem || initialsElem} className="header-dropdown"/>
             : <HeaderBarButton className="sign-in" icon="xicon icon cloud-user" title={lf("Sign In")} label={lf("Sign In")} onClick={ () => {
                pxt.tickEvent(`skillmap.usermenu.signin`);
                 this.props.dispatchShowLoginModal();
            }}/>}
        </div>;
    }

    render() {
        const { activityOpen } = this.props;
        const hasIdentity = pxt.auth.hasIdentity();

        const appTheme = pxt.appTarget?.appTheme;
        const settingItems = this.getSettingItems();
        const helpItems = this.getHelpItems();

        return <div className="header">
            <div className="header-left">
                {this.getOrganizationLogo(appTheme)}
                {this.getTargetLogo(appTheme)}
            </div>

            <div className="spacer" />
            <div className="header-right">
                { activityOpen && <HeaderBarButton icon="icon arrow left" title={lf("Return to activity selection")} onClick={this.onBackClicked}/> }
                <HeaderBarButton icon="icon home" title={lf("Return to the editor homepage")} onClick={this.onHomeClicked}/>
                { helpItems?.length > 0 && <Dropdown icon="help circle" className="header-dropdown" items={helpItems} /> }
                { settingItems?.length > 0 && <Dropdown icon="setting" className="header-dropdown" items={settingItems} /> }
                { hasIdentity && this.getUserMenu() }
            </div>
        </div>
    }

    onBackClicked = () => {
        const { currentMapId, currentActivityId } = this.props;
        tickEvent("skillmap.activity.back", { path: currentMapId || "", activity: currentActivityId || "" });
        this.props.dispatchSaveAndCloseActivity();
    }

    onHomeClicked = () => {
        tickEvent("skillmap.home");

        // relprefix looks like "/beta---", need to chop off the hyphens and slash
        let rel = pxt.webConfig?.relprefix.substr(0, pxt.webConfig.relprefix.length - 3);
        if (pxt.appTarget.appTheme.homeUrl && rel) {
            if (pxt.appTarget.appTheme.homeUrl?.lastIndexOf("/") === pxt.appTarget.appTheme.homeUrl?.length - 1) {
                rel = rel.substr(1);
            }
            window.open(pxt.appTarget.appTheme.homeUrl + rel);
        }
        else {
            window.open(pxt.appTarget.appTheme.homeUrl);
        }

    }

    onBugClicked = () => {
        tickEvent("skillmap.bugreport");
        (window as any).usabilla_live?.("click");
    }

    onLogoutClicked = async () => {
        pxt.tickEvent(`skillmap.usermenu.signout`);
        await pxt.auth.client().logoutAsync(location.hash)
    }

    onProfileClicked = () => {
        pxt.tickEvent(`skillmap.profile`)
        this.props.dispatchShowUserProfile();
    }
}

interface HeaderBarButtonProps {
    icon: string;
    label?: string;
    title: string;
    onClick: () => void;
    className?: string;
}

const HeaderBarButton = (props: HeaderBarButtonProps) => {
    const { icon, label, title, onClick, className } = props;

    return <div className={`header-button ${!label ? "icon-only" : "with-label"} ${className}`} title={title} role="button" onClick={onClick}>
        <i className={icon} />
        {label && <span className="header-button-label">{label}</span>}
    </div>
}

function mapStateToProps(state: SkillMapState, ownProps: any) {
    if (!state) return {};

    let completedHeaderId: string | undefined;
    if (state.editorView?.currentHeaderId) {
        if (isActivityCompleted(state.user, state.pageSourceUrl, state.editorView.currentMapId, state.editorView.currentActivityId)) {
            completedHeaderId = state.editorView.currentHeaderId;
        }
    }

    const activityOpen = !!state.editorView;

    if (state.editorView?.currentActivityId) {
        const activity = state.maps[state.editorView.currentMapId]?.activities[state.editorView.currentActivityId];
    }

    return {
        activityOpen,
        currentMapId: activityOpen && state.editorView?.currentMapId,
        currentActivityId: activityOpen && state.editorView?.currentActivityId,
        showReportAbuse: state.pageSourceStatus === "unknown",
        signedIn: state.auth.signedIn
    }
}


const mapDispatchToProps = {
    dispatchSaveAndCloseActivity,
    dispatchShowResetUserModal,
    dispatchShowLoginModal,
    dispatchShowUserProfile
};

export const HeaderBar = connect(mapStateToProps, mapDispatchToProps)(HeaderBarImpl);