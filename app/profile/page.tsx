"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadProfile = async () => {
      if (user) {
        // Try to load from profiles table first
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (profile) {
          setDisplayName(profile.display_name || user.email?.split("@")[0] || "");
          setAvatarUrl(profile.avatar_url || "");
        } else {
          // Fallback to user metadata
          const metadata = user.user_metadata || {};
          setDisplayName(metadata.display_name || user.email?.split("@")[0] || "");
          setAvatarUrl(metadata.avatar_url || "");
        }
      }
    };
    loadProfile();
  }, [user]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setMessage(null);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error("You must select an image to upload.");
      }

      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      setAvatarUrl(data.publicUrl);
      setMessage({ type: "success", text: "Avatar uploaded successfully!" });
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setMessage(null);

      if (!user) throw new Error("User not authenticated");

      // Update both auth metadata AND profiles table
      const [authResult, profileResult] = await Promise.all([
        supabase.auth.updateUser({
          data: {
            display_name: displayName,
            avatar_url: avatarUrl,
          },
        }),
        supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            display_name: displayName,
            avatar_url: avatarUrl,
          })
      ]);

      if (authResult.error) throw authResult.error;
      if (profileResult.error) throw profileResult.error;

      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "radial-gradient(ellipse at center, #D5D5D5 0%, #C5C5C5 50%, #B5B5B5 100%)",
        }}
      >
        <p style={{ color: "#ffffff", fontFamily: "'Crimson Text', serif" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "radial-gradient(ellipse at center, #D5D5D5 0%, #C5C5C5 50%, #B5B5B5 100%)",
        paddingTop: "80px",
      }}
    >
      {/* Frosted Glass Toolbar */}
      <nav
        className="fixed left-1/2 z-50 flex items-center"
        style={{
          top: "20px",
          transform: "translateX(-50%)",
          background: "rgba(255, 255, 255, 0.15)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: "0.5px solid rgba(255, 255, 255, 0.18)",
          boxShadow: "0 8px 32px rgba(31, 38, 135, 0.15)",
          padding: "8px 12px",
          borderRadius: "16px",
        }}
      >
        <a
          href="/"
          className="px-4 py-2 font-medium text-gray-800 hover:text-gray-900 transition-all duration-200"
          style={{
            fontFamily: "'Crimson Text', serif",
            fontSize: "15px",
            letterSpacing: "-0.01em",
          }}
        >
          ← Back to Home
        </a>
      </nav>

      {/* Profile Content */}
      <div className="flex items-center justify-center px-8 py-20">
        <div
          className="w-full max-w-2xl p-8"
          style={{
            background: "rgba(255, 255, 255, 0.15)",
            backdropFilter: "blur(80px) saturate(200%)",
            WebkitBackdropFilter: "blur(80px) saturate(200%)",
            border: "1px solid rgba(255, 255, 255, 0.25)",
            borderRadius: "24px",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.3)",
          }}
        >
          <h1
            className="text-4xl font-bold mb-8"
            style={{
              fontFamily: "'Crimson Text', serif",
              color: "#ffffff",
              textShadow: "0 0 3px rgba(0, 0, 0, 0.3)",
            }}
          >
            Edit Profile
          </h1>

          {/* Message */}
          {message && (
            <div
              className="mb-6 p-4"
              style={{
                background:
                  message.type === "success"
                    ? "rgba(76, 175, 80, 0.2)"
                    : "rgba(244, 67, 54, 0.2)",
                border: `1px solid ${
                  message.type === "success" ? "rgba(76, 175, 80, 0.5)" : "rgba(244, 67, 54, 0.5)"
                }`,
                borderRadius: "12px",
                color: "#ffffff",
                fontFamily: "'Crimson Text', serif",
              }}
            >
              {message.text}
            </div>
          )}

          {/* Avatar Section */}
          <div className="mb-8">
            <label
              className="block text-sm font-semibold mb-4"
              style={{
                color: "#ffffff",
                fontFamily: "'Crimson Text', serif",
              }}
            >
              Profile Photo
            </label>
            <div className="flex items-center gap-6">
              <div
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid rgba(255, 255, 255, 0.3)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontSize: "48px",
                      fontWeight: "600",
                    }}
                  >
                    {(displayName || user.email || "U")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
                <label
                  htmlFor="avatar-upload"
                  className="px-6 py-3 text-sm cursor-pointer transition-all hover:scale-105 inline-block"
                  style={{
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "white",
                    borderRadius: "12px",
                    border: "none",
                    fontFamily: "'Crimson Text', serif",
                    fontWeight: "500",
                    boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
                  }}
                >
                  {uploading ? "Uploading..." : "Upload New Photo"}
                </label>
                <p
                  className="mt-2 text-xs"
                  style={{
                    color: "rgba(255, 255, 255, 0.7)",
                    fontFamily: "'Crimson Text', serif",
                  }}
                >
                  JPG, PNG or GIF. Max 5MB.
                </p>
              </div>
            </div>
          </div>

          {/* Display Name */}
          <div className="mb-8">
            <label
              htmlFor="display-name"
              className="block text-sm font-semibold mb-2"
              style={{
                color: "#ffffff",
                fontFamily: "'Crimson Text', serif",
              }}
            >
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              className="w-full px-4 py-3 text-sm"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: "12px",
                color: "#ffffff",
                fontFamily: "'Crimson Text', serif",
                outline: "none",
              }}
            />
          </div>

          {/* Email (Read-only) */}
          <div className="mb-8">
            <label
              className="block text-sm font-semibold mb-2"
              style={{
                color: "#ffffff",
                fontFamily: "'Crimson Text', serif",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={user.email || ""}
              disabled
              className="w-full px-4 py-3 text-sm"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "12px",
                color: "rgba(255, 255, 255, 0.6)",
                fontFamily: "'Crimson Text', serif",
                outline: "none",
                cursor: "not-allowed",
              }}
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="w-full px-6 py-4 text-base transition-all hover:scale-105"
            style={{
              background: saving
                ? "rgba(102, 126, 234, 0.5)"
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              borderRadius: "12px",
              border: "none",
              fontFamily: "'Crimson Text', serif",
              fontWeight: "600",
              boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
