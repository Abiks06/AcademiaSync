"use client";

import { useState } from "react";
import { AvatarPicker } from "./avatar-picker";
import { TitlePageForm, type ProfileFields } from "./title-page-form";

/** The title page together with the picture picker, so a new picture shows in the preview at once. */
export function ProfileEditor(props: {
  userId: string;
  defaults: ProfileFields;
  email: string;
  avatarUrl: string | null;
  color: string;
  mode: "welcome" | "settings";
  next?: string;
}) {
  const [avatar, setAvatar] = useState(props.avatarUrl);
  return (
    <TitlePageForm
      {...props}
      avatarUrl={avatar}
      aside={<AvatarPicker userId={props.userId} name={props.defaults.full_name || props.email} url={avatar} onChange={setAvatar} />}
    />
  );
}
