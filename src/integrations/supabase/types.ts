export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      book_chapters: {
        Row: {
          book_id: string;
          chapter_index: number;
          created_at: string;
          html: string;
          id: string;
          text: string;
          title: string | null;
          updated_at: string;
          user_id: string;
          word_count: number;
        };
        Insert: {
          book_id: string;
          chapter_index: number;
          created_at?: string;
          html: string;
          id?: string;
          text: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
          word_count?: number;
        };
        Update: {
          book_id?: string;
          chapter_index?: number;
          created_at?: string;
          html?: string;
          id?: string;
          text?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
          word_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "book_chapters_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };
      books: {
        Row: {
          author: string | null;
          chapter_count: number;
          client_id: string;
          cover_url: string | null;
          created_at: string;
          file_name: string | null;
          file_size: number | null;
          id: string;
          language: string | null;
          last_chapter_index: number;
          last_scroll_ratio: number;
          mime_type: string | null;
          storage_path: string | null;
          title: string;
          total_read_seconds: number;
          updated_at: string;
          user_id: string;
          word_count: number;
        };
        Insert: {
          author?: string | null;
          chapter_count?: number;
          client_id: string;
          cover_url?: string | null;
          created_at?: string;
          file_name?: string | null;
          file_size?: number | null;
          id?: string;
          language?: string | null;
          last_chapter_index?: number;
          last_scroll_ratio?: number;
          mime_type?: string | null;
          storage_path?: string | null;
          title: string;
          total_read_seconds?: number;
          updated_at?: string;
          user_id: string;
          word_count?: number;
        };
        Update: {
          author?: string | null;
          chapter_count?: number;
          client_id?: string;
          cover_url?: string | null;
          created_at?: string;
          file_name?: string | null;
          file_size?: number | null;
          id?: string;
          language?: string | null;
          last_chapter_index?: number;
          last_scroll_ratio?: number;
          mime_type?: string | null;
          storage_path?: string | null;
          title?: string;
          total_read_seconds?: number;
          updated_at?: string;
          user_id?: string;
          word_count?: number;
        };
        Relationships: [];
      };
      daily_quests: {
        Row: {
          claimed: boolean;
          completed: boolean;
          created_at: string;
          description: string | null;
          expires_at: string;
          id: string;
          progress: number;
          quest_key: string;
          reward_xp: number;
          target: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          claimed?: boolean;
          completed?: boolean;
          created_at?: string;
          description?: string | null;
          expires_at: string;
          id?: string;
          progress?: number;
          quest_key: string;
          reward_xp?: number;
          target?: number;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          claimed?: boolean;
          completed?: boolean;
          created_at?: string;
          description?: string | null;
          expires_at?: string;
          id?: string;
          progress?: number;
          quest_key?: string;
          reward_xp?: number;
          target?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      leitner_cards: {
        Row: {
          antonyms: string[];
          audio_url: string | null;
          back: string;
          box: number;
          cefr: string | null;
          client_id: string | null;
          created_at: string;
          ease_factor: number;
          example_sentence: string | null;
          folder_id: string | null;
          front: string;
          front_normalized: string;
          id: string;
          image_url: string | null;
          lapse_count: number;
          last_interval_ms: number | null;
          last_reviewed: string | null;
          next_review: string;
          part_of_speech: string | null;
          review_log: Json;
          source_app: string;
          source_cue_id: string | null;
          source_end_ms: number | null;
          source_ref: string | null;
          source_start_ms: number | null;
          source_title: string | null;
          source_url: string | null;
          starred: boolean;
          synonyms: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          antonyms?: string[];
          audio_url?: string | null;
          back: string;
          box?: number;
          cefr?: string | null;
          client_id?: string | null;
          created_at?: string;
          ease_factor?: number;
          example_sentence?: string | null;
          folder_id?: string | null;
          front: string;
          front_normalized: string;
          id?: string;
          image_url?: string | null;
          lapse_count?: number;
          last_interval_ms?: number | null;
          last_reviewed?: string | null;
          next_review?: string;
          part_of_speech?: string | null;
          review_log?: Json;
          source_app?: string;
          source_cue_id?: string | null;
          source_end_ms?: number | null;
          source_ref?: string | null;
          source_start_ms?: number | null;
          source_title?: string | null;
          source_url?: string | null;
          starred?: boolean;
          synonyms?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          antonyms?: string[];
          audio_url?: string | null;
          back?: string;
          box?: number;
          cefr?: string | null;
          client_id?: string | null;
          created_at?: string;
          ease_factor?: number;
          example_sentence?: string | null;
          folder_id?: string | null;
          front?: string;
          front_normalized?: string;
          id?: string;
          image_url?: string | null;
          lapse_count?: number;
          last_interval_ms?: number | null;
          last_reviewed?: string | null;
          next_review?: string;
          part_of_speech?: string | null;
          review_log?: Json;
          source_app?: string;
          source_cue_id?: string | null;
          source_end_ms?: number | null;
          source_ref?: string | null;
          source_start_ms?: number | null;
          source_title?: string | null;
          source_url?: string | null;
          starred?: boolean;
          synonyms?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      leitner_folders: {
        Row: {
          client_id: string | null;
          color: string | null;
          created_at: string;
          id: string;
          kind: string;
          name: string;
          parent_id: string | null;
          source_ref: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          client_id?: string | null;
          color?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          parent_id?: string | null;
          source_ref?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          client_id?: string | null;
          color?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          parent_id?: string | null;
          source_ref?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leitner_folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "leitner_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      news_articles: {
        Row: {
          author: string | null;
          content_html: string | null;
          content_md: string | null;
          created_at: string;
          excerpt: string | null;
          fetched_at: string;
          id: string;
          image_url: string | null;
          is_saved: boolean;
          language: string | null;
          published_at: string | null;
          site_name: string | null;
          source_id: string | null;
          title: string;
          updated_at: string;
          url: string;
          user_id: string;
          word_count: number;
        };
        Insert: {
          author?: string | null;
          content_html?: string | null;
          content_md?: string | null;
          created_at?: string;
          excerpt?: string | null;
          fetched_at?: string;
          id?: string;
          image_url?: string | null;
          is_saved?: boolean;
          language?: string | null;
          published_at?: string | null;
          site_name?: string | null;
          source_id?: string | null;
          title: string;
          updated_at?: string;
          url: string;
          user_id: string;
          word_count?: number;
        };
        Update: {
          author?: string | null;
          content_html?: string | null;
          content_md?: string | null;
          created_at?: string;
          excerpt?: string | null;
          fetched_at?: string;
          id?: string;
          image_url?: string | null;
          is_saved?: boolean;
          language?: string | null;
          published_at?: string | null;
          site_name?: string | null;
          source_id?: string | null;
          title?: string;
          updated_at?: string;
          url?: string;
          user_id?: string;
          word_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "news_articles_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "news_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      news_blocked_domains: {
        Row: {
          created_at: string;
          domain: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          domain: string;
          id?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          domain?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      news_digests: {
        Row: {
          content_html: string;
          content_md: string;
          created_at: string;
          id: string;
          length: string;
          model: string | null;
          scope: string;
          source_articles: Json;
          source_id: string | null;
          title: string;
          topic: string | null;
          updated_at: string;
          user_id: string;
          window_hours: number;
          word_count: number;
        };
        Insert: {
          content_html: string;
          content_md: string;
          created_at?: string;
          id?: string;
          length: string;
          model?: string | null;
          scope: string;
          source_articles?: Json;
          source_id?: string | null;
          title: string;
          topic?: string | null;
          updated_at?: string;
          user_id: string;
          window_hours?: number;
          word_count?: number;
        };
        Update: {
          content_html?: string;
          content_md?: string;
          created_at?: string;
          id?: string;
          length?: string;
          model?: string | null;
          scope?: string;
          source_articles?: Json;
          source_id?: string | null;
          title?: string;
          topic?: string | null;
          updated_at?: string;
          user_id?: string;
          window_hours?: number;
          word_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "news_digests_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "news_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      news_folders: {
        Row: {
          color: string | null;
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      news_sources: {
        Row: {
          created_at: string;
          folder_id: string | null;
          id: string;
          kind: string;
          language: string | null;
          name: string;
          sort_order: number;
          topic: string | null;
          updated_at: string;
          url: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          kind: string;
          language?: string | null;
          name: string;
          sort_order?: number;
          topic?: string | null;
          updated_at?: string;
          url?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          kind?: string;
          language?: string | null;
          name?: string;
          sort_order?: number;
          topic?: string | null;
          updated_at?: string;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      paragraph_analyses: {
        Row: {
          analyzed_at: string;
          book_client_id: string | null;
          chapter_index: number | null;
          created_at: string;
          id: string;
          idioms: Json;
          model: string | null;
          paragraph_hash: string;
          translation: string;
          updated_at: string;
          user_id: string;
          vocabulary: Json;
        };
        Insert: {
          analyzed_at?: string;
          book_client_id?: string | null;
          chapter_index?: number | null;
          created_at?: string;
          id?: string;
          idioms?: Json;
          model?: string | null;
          paragraph_hash: string;
          translation?: string;
          updated_at?: string;
          user_id: string;
          vocabulary?: Json;
        };
        Update: {
          analyzed_at?: string;
          book_client_id?: string | null;
          chapter_index?: number | null;
          created_at?: string;
          id?: string;
          idioms?: Json;
          model?: string | null;
          paragraph_hash?: string;
          translation?: string;
          updated_at?: string;
          user_id?: string;
          vocabulary?: Json;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      scenario_saved_sentences: {
        Row: {
          created_at: string;
          english: string;
          grammar_correction: string | null;
          id: string;
          note: string | null;
          persian: string | null;
          session_id: string | null;
          source_role: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          english: string;
          grammar_correction?: string | null;
          id?: string;
          note?: string | null;
          persian?: string | null;
          session_id?: string | null;
          source_role?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          english?: string;
          grammar_correction?: string | null;
          id?: string;
          note?: string | null;
          persian?: string | null;
          session_id?: string | null;
          source_role?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenario_saved_sentences_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "scenario_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      scenario_sessions: {
        Row: {
          ai_role: string | null;
          category_label: string | null;
          category_slug: string | null;
          chosen_index: number | null;
          completion_reason: string | null;
          created_at: string;
          id: string;
          is_complete: boolean;
          messages: Json;
          scenarios: Json;
          sub_slugs: string[];
          target_sentence_ids: string[];
          updated_at: string;
          used_sentence_ids: string[];
          user_id: string;
          user_role: string | null;
        };
        Insert: {
          ai_role?: string | null;
          category_label?: string | null;
          category_slug?: string | null;
          chosen_index?: number | null;
          completion_reason?: string | null;
          created_at?: string;
          id?: string;
          is_complete?: boolean;
          messages?: Json;
          scenarios?: Json;
          sub_slugs?: string[];
          target_sentence_ids?: string[];
          updated_at?: string;
          used_sentence_ids?: string[];
          user_id: string;
          user_role?: string | null;
        };
        Update: {
          ai_role?: string | null;
          category_label?: string | null;
          category_slug?: string | null;
          chosen_index?: number | null;
          completion_reason?: string | null;
          created_at?: string;
          id?: string;
          is_complete?: boolean;
          messages?: Json;
          scenarios?: Json;
          sub_slugs?: string[];
          target_sentence_ids?: string[];
          updated_at?: string;
          used_sentence_ids?: string[];
          user_id?: string;
          user_role?: string | null;
        };
        Relationships: [];
      };
      sentence_categories: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          domain: string;
          icon: string | null;
          id: string;
          is_default: boolean;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          domain?: string;
          icon?: string | null;
          id?: string;
          is_default?: boolean;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          domain?: string;
          icon?: string | null;
          id?: string;
          is_default?: boolean;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sentence_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "sentence_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      sentence_flags: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          label: string | null;
          note: string | null;
          sentence_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          note?: string | null;
          sentence_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          label?: string | null;
          note?: string | null;
          sentence_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sentence_lab: {
        Row: {
          ai_counter_prompt: string | null;
          audio_url: string | null;
          category: string | null;
          cefr_level: string | null;
          common_mistakes: string[];
          created_at: string;
          created_by: string | null;
          cultural_note: string | null;
          difficulty_score: number | null;
          english: string;
          english_aussie: string | null;
          exam_task_type: string | null;
          expected_duration_seconds: number | null;
          expected_intent: string | null;
          grammar_focus: string[];
          id: string;
          persian: string | null;
          status: string;
          subcategory: string | null;
          updated_at: string;
          variations: Json;
          vocabulary_tags: string[];
        };
        Insert: {
          ai_counter_prompt?: string | null;
          audio_url?: string | null;
          category?: string | null;
          cefr_level?: string | null;
          common_mistakes?: string[];
          created_at?: string;
          created_by?: string | null;
          cultural_note?: string | null;
          difficulty_score?: number | null;
          english: string;
          english_aussie?: string | null;
          exam_task_type?: string | null;
          expected_duration_seconds?: number | null;
          expected_intent?: string | null;
          grammar_focus?: string[];
          id: string;
          persian?: string | null;
          status?: string;
          subcategory?: string | null;
          updated_at?: string;
          variations?: Json;
          vocabulary_tags?: string[];
        };
        Update: {
          ai_counter_prompt?: string | null;
          audio_url?: string | null;
          category?: string | null;
          cefr_level?: string | null;
          common_mistakes?: string[];
          created_at?: string;
          created_by?: string | null;
          cultural_note?: string | null;
          difficulty_score?: number | null;
          english?: string;
          english_aussie?: string | null;
          exam_task_type?: string | null;
          expected_duration_seconds?: number | null;
          expected_intent?: string | null;
          grammar_focus?: string[];
          id?: string;
          persian?: string | null;
          status?: string;
          subcategory?: string | null;
          updated_at?: string;
          variations?: Json;
          vocabulary_tags?: string[];
        };
        Relationships: [];
      };
      sentence_paths: {
        Row: {
          color: string | null;
          created_at: string;
          description: string | null;
          domain: string;
          icon: string | null;
          id: string;
          is_builtin: boolean;
          name: string;
          recipe: Json;
          sort_order: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          domain?: string;
          icon?: string | null;
          id?: string;
          is_builtin?: boolean;
          name: string;
          recipe?: Json;
          sort_order?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          domain?: string;
          icon?: string | null;
          id?: string;
          is_builtin?: boolean;
          name?: string;
          recipe?: Json;
          sort_order?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      sentence_progress: {
        Row: {
          created_at: string;
          difficulty: number;
          elapsed_days: number;
          fluency_score: number | null;
          grammar_score: number | null;
          id: string;
          lapses: number;
          last_reviewed_at: string | null;
          next_review_date: string;
          pronunciation_score: number | null;
          reps: number;
          sentence_id: string;
          stability: number;
          state: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          difficulty?: number;
          elapsed_days?: number;
          fluency_score?: number | null;
          grammar_score?: number | null;
          id?: string;
          lapses?: number;
          last_reviewed_at?: string | null;
          next_review_date?: string;
          pronunciation_score?: number | null;
          reps?: number;
          sentence_id: string;
          stability?: number;
          state?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          difficulty?: number;
          elapsed_days?: number;
          fluency_score?: number | null;
          grammar_score?: number | null;
          id?: string;
          lapses?: number;
          last_reviewed_at?: string | null;
          next_review_date?: string;
          pronunciation_score?: number | null;
          reps?: number;
          sentence_id?: string;
          stability?: number;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sentence_progress_sentence_id_fkey";
            columns: ["sentence_id"];
            isOneToOne: false;
            referencedRelation: "sentence_lab";
            referencedColumns: ["id"];
          },
        ];
      };
      user_achievements: {
        Row: {
          achievement_key: string;
          id: string;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_key: string;
          id?: string;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_key?: string;
          id?: string;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_gamification: {
        Row: {
          combo_best: number;
          created_at: string;
          current_streak: number;
          gems: number;
          hearts: number;
          hearts_refilled_at: string;
          last_active_date: string | null;
          level: number;
          longest_streak: number;
          total_reviews: number;
          updated_at: string;
          user_id: string;
          xp: number;
        };
        Insert: {
          combo_best?: number;
          created_at?: string;
          current_streak?: number;
          gems?: number;
          hearts?: number;
          hearts_refilled_at?: string;
          last_active_date?: string | null;
          level?: number;
          longest_streak?: number;
          total_reviews?: number;
          updated_at?: string;
          user_id: string;
          xp?: number;
        };
        Update: {
          combo_best?: number;
          created_at?: string;
          current_streak?: number;
          gems?: number;
          hearts?: number;
          hearts_refilled_at?: string;
          last_active_date?: string | null;
          level?: number;
          longest_streak?: number;
          total_reviews?: number;
          updated_at?: string;
          user_id?: string;
          xp?: number;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          created_at: string;
          settings: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          settings?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          settings?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      gamif_claim_quest: {
        Args: { _quest_id: string };
        Returns: {
          combo_best: number;
          created_at: string;
          current_streak: number;
          gems: number;
          hearts: number;
          hearts_refilled_at: string;
          last_active_date: string | null;
          level: number;
          longest_streak: number;
          total_reviews: number;
          updated_at: string;
          user_id: string;
          xp: number;
        };
        SetofOptions: {
          from: "*";
          to: "user_gamification";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      gamif_ensure_state: {
        Args: never;
        Returns: {
          combo_best: number;
          created_at: string;
          current_streak: number;
          gems: number;
          hearts: number;
          hearts_refilled_at: string;
          last_active_date: string | null;
          level: number;
          longest_streak: number;
          total_reviews: number;
          updated_at: string;
          user_id: string;
          xp: number;
        };
        SetofOptions: {
          from: "*";
          to: "user_gamification";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      gamif_level_from_xp: { Args: { _xp: number }; Returns: number };
      gamif_record_grade: {
        Args: { _combo: number; _grade: string };
        Returns: {
          combo_best: number;
          created_at: string;
          current_streak: number;
          gems: number;
          hearts: number;
          hearts_refilled_at: string;
          last_active_date: string | null;
          level: number;
          longest_streak: number;
          total_reviews: number;
          updated_at: string;
          user_id: string;
          xp: number;
        };
        SetofOptions: {
          from: "*";
          to: "user_gamification";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      grant_achievement: {
        Args: { _key: string };
        Returns: {
          achievement_key: string;
          id: string;
          unlocked_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "user_achievements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
